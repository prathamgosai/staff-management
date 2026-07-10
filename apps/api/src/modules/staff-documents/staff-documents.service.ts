import {
  Injectable, Inject, NotFoundException, ForbiddenException,
  BadRequestException, PayloadTooLargeException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { allowedOutletIds } from "../../common/auth/outlet-scope";
import { istTodayStr } from "../../common/utils/date.util";
import type { AuthUser } from "@workforceiq/shared";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { UpsertDocumentTypeDto } from "./dto/document-type.dto";
import { DocumentCryptoService } from "./document-crypto.service";
import { DocumentStorageService } from "./document-storage.service";
import { validateSignature } from "./file-signature";
import { deriveStatus, maskNumber } from "./document-rules";

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB decoded (configurable via MAX_DOCUMENT_BYTES)
const DOWNLOAD_TTL_MS = 5 * 60 * 1000; // signed download URL lifetime

export interface AuditCtx {
  ip?: string;
  userAgent?: string;
}
type DocAction = "upload" | "view" | "download" | "reveal" | "replace" | "delete" | "denied";

interface StaffRow {
  id: string;
  user_id: string | null;
  current_outlet_id: string | null;
}

/**
 * Staff document vault (Feature 1). Compliance-grade:
 *   • bytes encrypted with AES-256-GCM (DocumentCryptoService) and stored in Supabase Storage
 *     (DocumentStorageService) or, as a fallback, encrypted-in-DB; never publicly reachable.
 *   • document numbers stored app-encrypted + a masked display value; full number only via
 *     reveal (documents:reveal), always audit-logged.
 *   • one ACTIVE document per (staff, type); re-uploading a type archives the prior file as a
 *     version (DocumentHistory) — nothing is hard-deleted; delete is a soft delete.
 *   • every upload/view/download/reveal/replace/delete written to an immutable access log.
 *
 * Access: write/reveal → staff:documents / documents:reveal (admin/hr; super_admin '*');
 * read → those callers OR the owner (staff.user_id === caller.id); status lists → documents:status.
 * All queries tenant-filtered; non-owner access outlet-scoped.
 */
@Injectable()
export class StaffDocumentsService {
  private readonly maxBytes: number;
  private readonly apiPrefix: string;

  constructor(
    @Inject(DB_POOL) private readonly db: Pool,
    private readonly crypto: DocumentCryptoService,
    private readonly storage: DocumentStorageService,
    config: ConfigService,
  ) {
    this.maxBytes = config.get<number>("MAX_DOCUMENT_BYTES", DEFAULT_MAX_BYTES);
    this.apiPrefix = "/" + config.get<string>("API_PREFIX", "api/v1").replace(/^\/+|\/+$/g, "");
  }

  // ── permission helpers ──────────────────────────────────────────────────────
  private has(user: AuthUser, key: string): boolean {
    const perms = user.permissions ?? [];
    return user.role === "super_admin" || perms.includes("*") || perms.includes(key);
  }
  private canManage(user: AuthUser): boolean { return this.has(user, "staff:documents"); }
  private canReveal(user: AuthUser): boolean { return this.has(user, "documents:reveal"); }
  private canViewStatus(user: AuthUser): boolean { return this.canManage(user) || this.has(user, "documents:status"); }

  /** Load the tenant-scoped staff row and authorize; 404 (not 403) when out of outlet scope. */
  private async authorizeStaff(user: AuthUser, staffId: string, mode: "read" | "write"): Promise<{ staff: StaffRow; isOwner: boolean }> {
    const res = await this.db.query(
      "SELECT id, user_id, current_outlet_id FROM staff WHERE id = $1 AND tenant_id = $2",
      [staffId, user.tenantId],
    );
    const staff = res.rows[0] as StaffRow | undefined;
    if (!staff) throw new NotFoundException(`Staff ${staffId} not found`);

    const isOwner = !!staff.user_id && staff.user_id === user.id;
    if (mode === "write") {
      if (!this.canManage(user)) throw new ForbiddenException("You do not have permission to manage staff documents.");
    } else if (!isOwner && !this.canManage(user)) {
      throw new ForbiddenException("You do not have permission to view these documents.");
    }
    if (!isOwner) {
      const allowed = allowedOutletIds(user);
      if (allowed !== null && !(staff.current_outlet_id && allowed.includes(staff.current_outlet_id))) {
        throw new NotFoundException(`Staff ${staffId} not found`);
      }
    }
    return { staff, isOwner };
  }

  // ── list / read ─────────────────────────────────────────────────────────────
  /** Metadata only — never file bytes. */
  async list(user: AuthUser, staffId: string) {
    await this.authorizeStaff(user, staffId, "read");
    const res = await this.db.query(
      `SELECT d.id, d.staff_id, d.doc_type, d.document_type_id, dt.name AS type_name,
              d.doc_number_masked, d.expires_on, d.status, d.current_version, d.notes,
              d.file_name, d.mime_type, d.size_bytes, d.uploaded_by, d.updated_by,
              d.created_at, d.updated_at,
              (d.doc_number_encrypted IS NOT NULL) AS has_full_number
       FROM staff_documents d
       LEFT JOIN document_types dt ON dt.id = d.document_type_id
       WHERE d.staff_id = $1 AND d.tenant_id = $2 AND d.deleted_at IS NULL
       ORDER BY dt.sort_order NULLS LAST, d.created_at DESC`,
      [staffId, user.tenantId],
    );
    return { data: res.rows.map((r) => this.mapMeta(r)) };
  }

  /** In-app preview / download: decrypt bytes for the caller. Audited as 'view'. */
  async getContent(user: AuthUser, staffId: string, docId: string, audit?: AuditCtx) {
    await this.authorizeStaff(user, staffId, "read");
    const doc = await this.loadDoc(user.tenantId, docId, staffId);
    const buffer = await this.readBytes(doc);
    await this.logAccess(user.tenantId, docId, staffId, user.id, "view", audit);
    return { mimeType: doc.mime_type, fileName: doc.file_name, buffer };
  }

  /** Issue a short-lived signed URL the browser can fetch without a bearer token. */
  async issueDownloadUrl(user: AuthUser, docId: string, audit?: AuditCtx) {
    const doc = await this.resolveDocForRead(user, docId);
    const expiresAt = Date.now() + DOWNLOAD_TTL_MS;
    const token = this.crypto.signDownloadToken(docId, expiresAt);
    await this.logAccess(user.tenantId, docId, doc.staff_id, user.id, "download", audit);
    return {
      data: {
        url: `${this.apiPrefix}/documents/${docId}/file?token=${encodeURIComponent(token)}`,
        expiresAt: new Date(expiresAt).toISOString(),
        fileName: doc.file_name,
      },
    };
  }

  /** Token-gated fetch (no JWT) — validates the HMAC token, streams decrypted bytes. */
  async getContentByToken(docId: string, token: string) {
    if (!this.crypto.verifyDownloadToken(docId, token, Date.now())) {
      throw new ForbiddenException("This download link is invalid or has expired.");
    }
    const res = await this.db.query(
      `SELECT id, tenant_id, staff_id, mime_type, file_name, storage_key, content_encrypted, content_base64
       FROM staff_documents WHERE id = $1 AND deleted_at IS NULL`,
      [docId],
    );
    const doc = res.rows[0];
    if (!doc) throw new NotFoundException("Document not found");
    const buffer = await this.readBytes(doc);
    await this.logAccess(doc.tenant_id, docId, doc.staff_id, null, "download");
    return { mimeType: doc.mime_type as string, fileName: doc.file_name as string, buffer };
  }

  /** Reveal the full (unmasked) document number. Gated by documents:reveal, always audited. */
  async revealNumber(user: AuthUser, docId: string, audit?: AuditCtx) {
    if (!this.canReveal(user)) {
      const doc = await this.db.query(
        "SELECT staff_id FROM staff_documents WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL",
        [docId, user.tenantId],
      );
      await this.logAccess(user.tenantId, docId, doc.rows[0]?.staff_id ?? null, user.id, "denied", audit, "reveal");
      throw new ForbiddenException("You do not have permission to reveal document numbers.");
    }
    const doc = await this.resolveDocForRead(user, docId);
    let full: string | null = null;
    if (doc.doc_number_encrypted) full = this.crypto.decryptString(doc.doc_number_encrypted as Buffer);
    else full = (doc.doc_number_masked as string | null) ?? null; // legacy/unencrypted fallback
    await this.logAccess(user.tenantId, docId, doc.staff_id, user.id, "reveal", audit);
    return { data: { number: full } };
  }

  async listVersions(user: AuthUser, docId: string) {
    const doc = await this.resolveDocForRead(user, docId);
    const res = await this.db.query(
      `SELECT id, version_no, file_name, mime_type, size_bytes, doc_number_masked,
              uploaded_by, uploaded_at, replaced_by, replaced_at
       FROM staff_document_versions WHERE document_id = $1 AND tenant_id = $2
       ORDER BY version_no DESC`,
      [docId, user.tenantId],
    );
    return {
      data: {
        currentVersion: doc.current_version,
        versions: res.rows.map((r) => ({
          id: r.id, versionNo: r.version_no, fileName: r.file_name, mimeType: r.mime_type,
          sizeBytes: r.size_bytes, docNumberMasked: r.doc_number_masked,
          uploadedBy: r.uploaded_by, uploadedAt: r.uploaded_at,
          replacedBy: r.replaced_by, replacedAt: r.replaced_at,
        })),
      },
    };
  }

  // ── create / replace ─────────────────────────────────────────────────────────
  async create(user: AuthUser, staffId: string, dto: CreateDocumentDto, audit?: AuditCtx) {
    await this.authorizeStaff(user, staffId, "write");

    const buffer = this.decodeAndValidate(dto);
    const type = await this.resolveType(user.tenantId, dto.docType);
    const fullNumber = dto.docNumber?.trim() || null;
    const masked = maskNumber(dto.docType, fullNumber);
    const status = deriveStatus(type, fullNumber, dto.expiresOn ?? null, istTodayStr());

    // Existing ACTIVE document of this type → replace (archive current as a version).
    const existing = await this.db.query(
      `SELECT * FROM staff_documents
       WHERE staff_id=$1 AND tenant_id=$2 AND document_type_id=$3 AND deleted_at IS NULL`,
      [staffId, user.tenantId, type.id],
    );
    if (existing.rows[0]) {
      return this.replaceInto(user, existing.rows[0], dto, buffer, masked, fullNumber, status, audit);
    }

    // Fresh insert. Persist bytes at version 1.
    const docId = (await this.db.query("SELECT uuid_generate_v4() AS id")).rows[0].id as string;
    const store = await this.persistBytes(user.tenantId, staffId, docId, 1, buffer, dto.mimeType);
    const numberEnc = fullNumber && this.crypto.isEnabled() ? this.crypto.encryptString(fullNumber) : null;

    const res = await this.db.query(
      `INSERT INTO staff_documents
         (id, tenant_id, staff_id, doc_type, document_type_id, doc_number_masked, doc_number_encrypted,
          expires_on, status, current_version, notes, file_name, mime_type, size_bytes,
          storage_key, content_encrypted, content_base64, uploaded_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11,$12,$13,$14,$15,$16,$17,$17)
       RETURNING id, staff_id, doc_type, document_type_id, doc_number_masked, expires_on, status,
                 current_version, notes, file_name, mime_type, size_bytes, uploaded_by, updated_by,
                 created_at, updated_at`,
      [
        docId, user.tenantId, staffId, dto.docType, type.id, masked, numberEnc,
        dto.expiresOn ?? null, status, dto.notes ?? null, dto.fileName, dto.mimeType, buffer.length,
        store.storageKey, store.contentEncrypted, store.contentBase64, user.id,
      ],
    );
    await this.logAccess(user.tenantId, docId, staffId, user.id, "upload", audit);
    return { data: this.mapMeta({ ...res.rows[0], type_name: type.name }) };
  }

  private async replaceInto(
    user: AuthUser, current: Record<string, any>, dto: CreateDocumentDto, buffer: Buffer,
    masked: string | null, fullNumber: string | null, status: string, audit?: AuditCtx,
  ) {
    const docId = current.id as string;
    const versionNo = current.current_version as number;
    // Archive the current file as a version (never deleted).
    await this.db.query(
      `INSERT INTO staff_document_versions
         (tenant_id, document_id, version_no, storage_key, content_encrypted, content_base64,
          file_name, mime_type, size_bytes, doc_number_masked, uploaded_by, uploaded_at, replaced_by, replaced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())`,
      [
        user.tenantId, docId, versionNo, current.storage_key, current.content_encrypted, current.content_base64,
        current.file_name, current.mime_type, current.size_bytes, current.doc_number_masked,
        current.uploaded_by, current.created_at, user.id,
      ],
    );
    const nextVersion = versionNo + 1;
    const store = await this.persistBytes(user.tenantId, current.staff_id, docId, nextVersion, buffer, dto.mimeType);
    const numberEnc = fullNumber && this.crypto.isEnabled() ? this.crypto.encryptString(fullNumber) : null;

    const res = await this.db.query(
      `UPDATE staff_documents SET
         doc_number_masked=$1, doc_number_encrypted=$2, expires_on=$3, status=$4,
         current_version=$5, notes=$6, file_name=$7, mime_type=$8, size_bytes=$9,
         storage_key=$10, content_encrypted=$11, content_base64=$12, updated_by=$13
       WHERE id=$14 AND tenant_id=$15
       RETURNING id, staff_id, doc_type, document_type_id, doc_number_masked, expires_on, status,
                 current_version, notes, file_name, mime_type, size_bytes, uploaded_by, updated_by,
                 created_at, updated_at`,
      [
        masked, numberEnc, dto.expiresOn ?? null, status, nextVersion, dto.notes ?? null,
        dto.fileName, dto.mimeType, buffer.length, store.storageKey, store.contentEncrypted,
        store.contentBase64, user.id, docId, user.tenantId,
      ],
    );
    await this.logAccess(user.tenantId, docId, current.staff_id, user.id, "replace", audit);
    return { data: this.mapMeta(res.rows[0]) };
  }

  async remove(user: AuthUser, staffId: string, docId: string, audit?: AuditCtx): Promise<void> {
    await this.authorizeStaff(user, staffId, "write");
    const res = await this.db.query(
      `UPDATE staff_documents SET deleted_at = NOW(), updated_by = $4
       WHERE id = $1 AND staff_id = $2 AND tenant_id = $3 AND deleted_at IS NULL
       RETURNING storage_key`,
      [docId, staffId, user.tenantId, user.id],
    );
    if (res.rowCount === 0) throw new NotFoundException("Document not found");
    await this.logAccess(user.tenantId, docId, staffId, user.id, "delete", audit);
    // Prune the Storage object (soft-deleted rows never serve bytes again).
    if (res.rows[0]?.storage_key) await this.storage.remove(res.rows[0].storage_key);
  }

  /** For /me: the caller's OWN documents (metadata only), resolved via staff.user_id. */
  async listOwn(user: AuthUser) {
    const staffRes = await this.db.query(
      "SELECT id FROM staff WHERE user_id = $1 AND tenant_id = $2",
      [user.id, user.tenantId],
    );
    const staffId = staffRes.rows[0]?.id as string | undefined;
    if (!staffId) throw new NotFoundException("No staff profile is linked to your account.");
    return this.list(user, staffId);
  }

  // ── cross-staff status queries (documents:status, outlet-scoped) ─────────────
  async expiring(user: AuthUser, days: number) {
    this.assertStatusAccess(user);
    const allowed = allowedOutletIds(user);
    const res = await this.db.query(
      `SELECT d.id, d.staff_id, s.name AS staff_name, s.current_outlet_id, o.name AS outlet_name,
              d.doc_type, dt.name AS type_name, d.expires_on, d.status
       FROM staff_documents d
       JOIN staff s ON s.id = d.staff_id
       LEFT JOIN outlets o ON o.id = s.current_outlet_id
       LEFT JOIN document_types dt ON dt.id = d.document_type_id
       WHERE d.tenant_id = $1 AND d.deleted_at IS NULL AND d.expires_on IS NOT NULL
         AND d.expires_on >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date
         AND d.expires_on <= ((NOW() AT TIME ZONE 'Asia/Kolkata')::date + ($2::int))
         AND ($3::uuid[] IS NULL OR s.current_outlet_id = ANY($3))
       ORDER BY d.expires_on ASC`,
      [user.tenantId, days, allowed],
    );
    return {
      data: res.rows.map((r) => ({
        id: r.id, staffId: r.staff_id, staffName: r.staff_name, outletName: r.outlet_name,
        docType: r.doc_type, typeName: r.type_name, expiresOn: r.expires_on, status: r.status,
      })),
    };
  }

  /** Active staff missing a mandatory (or a specified) document type. */
  async missing(user: AuthUser, typeKey?: string) {
    this.assertStatusAccess(user);
    const allowed = allowedOutletIds(user);
    const res = await this.db.query(
      `SELECT s.id AS staff_id, s.name AS staff_name, s.current_outlet_id, o.name AS outlet_name,
              dt.key AS doc_type, dt.name AS type_name
       FROM staff s
       CROSS JOIN document_types dt
       LEFT JOIN outlets o ON o.id = s.current_outlet_id
       WHERE s.tenant_id = $1 AND s.employment_status = 'active'
         AND dt.tenant_id = $1 AND dt.is_active = TRUE AND dt.deleted_at IS NULL
         AND ($2::text IS NULL AND dt.is_mandatory = TRUE OR dt.key = $2)
         AND ($3::uuid[] IS NULL OR s.current_outlet_id = ANY($3))
         AND NOT EXISTS (
           SELECT 1 FROM staff_documents d
           WHERE d.staff_id = s.id AND d.document_type_id = dt.id AND d.deleted_at IS NULL
         )
       ORDER BY s.name ASC, dt.sort_order ASC`,
      [user.tenantId, typeKey ?? null, allowed],
    );
    return {
      data: res.rows.map((r) => ({
        staffId: r.staff_id, staffName: r.staff_name, outletName: r.outlet_name,
        docType: r.doc_type, typeName: r.type_name,
      })),
    };
  }

  /** Dashboard widgets: expiring-in-30, missing-mandatory count, recently uploaded. */
  async widgets(user: AuthUser) {
    this.assertStatusAccess(user);
    const allowed = allowedOutletIds(user);
    const [expiring, missingCount, recent] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*)::int AS n FROM staff_documents d JOIN staff s ON s.id=d.staff_id
         WHERE d.tenant_id=$1 AND d.deleted_at IS NULL AND d.expires_on IS NOT NULL
           AND d.expires_on BETWEEN (NOW() AT TIME ZONE 'Asia/Kolkata')::date
                                AND ((NOW() AT TIME ZONE 'Asia/Kolkata')::date + 30)
           AND ($2::uuid[] IS NULL OR s.current_outlet_id = ANY($2))`,
        [user.tenantId, allowed],
      ),
      this.db.query(
        `SELECT COUNT(DISTINCT s.id)::int AS n
         FROM staff s CROSS JOIN document_types dt
         WHERE s.tenant_id=$1 AND s.employment_status='active'
           AND dt.tenant_id=$1 AND dt.is_mandatory=TRUE AND dt.is_active=TRUE AND dt.deleted_at IS NULL
           AND ($2::uuid[] IS NULL OR s.current_outlet_id = ANY($2))
           AND NOT EXISTS (SELECT 1 FROM staff_documents d
             WHERE d.staff_id=s.id AND d.document_type_id=dt.id AND d.deleted_at IS NULL)`,
        [user.tenantId, allowed],
      ),
      this.db.query(
        `SELECT d.id, d.staff_id, s.name AS staff_name, d.doc_type, dt.name AS type_name, d.created_at
         FROM staff_documents d JOIN staff s ON s.id=d.staff_id
         LEFT JOIN document_types dt ON dt.id=d.document_type_id
         WHERE d.tenant_id=$1 AND d.deleted_at IS NULL
           AND ($2::uuid[] IS NULL OR s.current_outlet_id = ANY($2))
         ORDER BY d.created_at DESC LIMIT 8`,
        [user.tenantId, allowed],
      ),
    ]);
    return {
      data: {
        expiringIn30Days: expiring.rows[0].n,
        employeesMissingMandatory: missingCount.rows[0].n,
        recentlyUploaded: recent.rows.map((r) => ({
          id: r.id, staffId: r.staff_id, staffName: r.staff_name,
          docType: r.doc_type, typeName: r.type_name, createdAt: r.created_at,
        })),
      },
    };
  }

  // ── document types (lookup) CRUD ─────────────────────────────────────────────
  async listTypes(user: AuthUser) {
    const res = await this.db.query(
      `SELECT id, key, name, is_mandatory, requires_number, requires_expiry, sort_order, is_active
       FROM document_types WHERE tenant_id=$1 AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC`,
      [user.tenantId],
    );
    return { data: res.rows.map((r) => this.mapType(r)) };
  }

  async createType(user: AuthUser, dto: UpsertDocumentTypeDto) {
    if (!this.canManage(user)) throw new ForbiddenException("You do not have permission to manage document types.");
    const key = (dto.key ?? dto.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    try {
      const res = await this.db.query(
        `INSERT INTO document_types (tenant_id, key, name, is_mandatory, requires_number, requires_expiry, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, key, name, is_mandatory, requires_number, requires_expiry, sort_order, is_active`,
        [user.tenantId, key, dto.name, !!dto.isMandatory, !!dto.requiresNumber, !!dto.requiresExpiry, dto.sortOrder ?? 100],
      );
      return { data: this.mapType(res.rows[0]) };
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new BadRequestException(`A document type with key "${key}" already exists.`);
      throw e;
    }
  }

  async updateType(user: AuthUser, id: string, dto: UpsertDocumentTypeDto) {
    if (!this.canManage(user)) throw new ForbiddenException("You do not have permission to manage document types.");
    const res = await this.db.query(
      `UPDATE document_types SET
         name=COALESCE($3,name), is_mandatory=COALESCE($4,is_mandatory),
         requires_number=COALESCE($5,requires_number), requires_expiry=COALESCE($6,requires_expiry),
         sort_order=COALESCE($7,sort_order), is_active=COALESCE($8,is_active)
       WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL
       RETURNING id, key, name, is_mandatory, requires_number, requires_expiry, sort_order, is_active`,
      [id, user.tenantId, dto.name ?? null, dto.isMandatory ?? null, dto.requiresNumber ?? null,
       dto.requiresExpiry ?? null, dto.sortOrder ?? null, dto.isActive ?? null],
    );
    if (res.rowCount === 0) throw new NotFoundException("Document type not found");
    return { data: this.mapType(res.rows[0]) };
  }

  async deleteType(user: AuthUser, id: string): Promise<void> {
    if (!this.canManage(user)) throw new ForbiddenException("You do not have permission to manage document types.");
    const inUse = await this.db.query(
      "SELECT 1 FROM staff_documents WHERE document_type_id=$1 AND tenant_id=$2 AND deleted_at IS NULL LIMIT 1",
      [id, user.tenantId],
    );
    if (inUse.rowCount) throw new BadRequestException("This type is in use by active documents; deactivate it instead.");
    const res = await this.db.query(
      "UPDATE document_types SET deleted_at=NOW(), is_active=FALSE WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL",
      [id, user.tenantId],
    );
    if (res.rowCount === 0) throw new NotFoundException("Document type not found");
  }

  // ── internals ────────────────────────────────────────────────────────────────
  private assertStatusAccess(user: AuthUser) {
    if (!this.canViewStatus(user)) throw new ForbiddenException("You do not have permission to view document status.");
  }

  private async resolveDocForRead(user: AuthUser, docId: string): Promise<Record<string, any>> {
    // Deliberately excludes the heavy content_base64 / content_encrypted blobs — reveal /
    // download-URL / versions never need the bytes (the token file endpoint fetches those).
    const res = await this.db.query(
      `SELECT d.id, d.staff_id, d.tenant_id, d.current_version, d.file_name, d.mime_type,
              d.doc_number_masked, d.doc_number_encrypted,
              s.user_id AS staff_user_id, s.current_outlet_id AS staff_outlet
       FROM staff_documents d JOIN staff s ON s.id = d.staff_id
       WHERE d.id = $1 AND d.tenant_id = $2 AND d.deleted_at IS NULL`,
      [docId, user.tenantId],
    );
    const doc = res.rows[0];
    if (!doc) throw new NotFoundException("Document not found");
    const isOwner = !!doc.staff_user_id && doc.staff_user_id === user.id;
    if (!isOwner && !this.canManage(user)) throw new ForbiddenException("You do not have permission to view this document.");
    if (!isOwner) {
      const allowed = allowedOutletIds(user);
      if (allowed !== null && !(doc.staff_outlet && allowed.includes(doc.staff_outlet))) {
        throw new NotFoundException("Document not found");
      }
    }
    return doc;
  }

  private async loadDoc(tenantId: string, docId: string, staffId: string): Promise<Record<string, any>> {
    const res = await this.db.query(
      `SELECT mime_type, file_name, storage_key, content_encrypted, content_base64
       FROM staff_documents WHERE id=$1 AND staff_id=$2 AND tenant_id=$3 AND deleted_at IS NULL`,
      [docId, staffId, tenantId],
    );
    if (!res.rows[0]) throw new NotFoundException("Document not found");
    return res.rows[0];
  }

  private decodeAndValidate(dto: CreateDocumentDto): Buffer {
    const commaIdx = dto.contentBase64.indexOf(",");
    const base64 = dto.contentBase64.startsWith("data:") && commaIdx !== -1
      ? dto.contentBase64.slice(commaIdx + 1) : dto.contentBase64;
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) throw new BadRequestException("File content is empty or not valid base64.");
    if (buffer.length > this.maxBytes) {
      throw new PayloadTooLargeException(`File is too large. Maximum size is ${Math.round(this.maxBytes / 1024 / 1024)} MB.`);
    }
    const check = validateSignature(buffer, dto.mimeType, dto.fileName);
    if (!check.ok) {
      throw new BadRequestException(
        check.reason === "mime_mismatch" || check.reason === "extension_mismatch"
          ? `File content does not match its declared type (${dto.mimeType}).`
          : "Unsupported or unrecognised file type. Allowed: PDF, JPG, PNG, WEBP.",
      );
    }
    return buffer;
  }

  /** Encrypt + persist bytes to Supabase Storage (preferred) or encrypted-in-DB, or plaintext (dev). */
  private async persistBytes(tenantId: string, staffId: string, docId: string, versionNo: number, buffer: Buffer, _mime: string) {
    if (this.crypto.isEnabled()) {
      const ciphertext = this.crypto.encrypt(buffer);
      if (this.storage.isConfigured()) {
        const key = this.storage.buildKey(tenantId, staffId, docId, versionNo);
        await this.storage.upload(key, ciphertext);
        return { storageKey: key, contentEncrypted: null as Buffer | null, contentBase64: null as string | null };
      }
      return { storageKey: null, contentEncrypted: ciphertext, contentBase64: null };
    }
    // Dev fallback (no encryption key configured): store plaintext base64.
    return { storageKey: null, contentEncrypted: null, contentBase64: buffer.toString("base64") };
  }

  private async readBytes(doc: Record<string, any>): Promise<Buffer> {
    if (doc.storage_key) {
      const ciphertext = await this.storage.download(doc.storage_key);
      return this.crypto.decrypt(ciphertext);
    }
    if (doc.content_encrypted) return this.crypto.decrypt(doc.content_encrypted as Buffer);
    if (doc.content_base64) return Buffer.from(doc.content_base64 as string, "base64");
    throw new NotFoundException("Document file is unavailable.");
  }

  private async resolveType(tenantId: string, key: string): Promise<{ id: string; name: string; is_mandatory: boolean; requires_number: boolean; requires_expiry: boolean }> {
    const res = await this.db.query(
      `SELECT id, name, is_mandatory, requires_number, requires_expiry
       FROM document_types WHERE tenant_id=$1 AND key=$2 AND deleted_at IS NULL AND is_active=TRUE`,
      [tenantId, key],
    );
    if (!res.rows[0]) throw new BadRequestException(`Unknown document type "${key}".`);
    return res.rows[0];
  }

  /** Best-effort audit write — never throws (a logging failure must not block the operation). */
  private async logAccess(
    tenantId: string, documentId: string | null, staffId: string | null,
    actorUserId: string | null, action: DocAction, audit?: AuditCtx, detail?: string,
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO document_access_logs
           (tenant_id, document_id, staff_id, actor_user_id, action, ip_address, user_agent, detail)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [tenantId, documentId, staffId, actorUserId, action, audit?.ip ?? null, audit?.userAgent ?? null, detail ?? null],
      );
    } catch {
      /* audit is best-effort; swallow */
    }
  }

  private mapMeta(r: Record<string, unknown>) {
    return {
      id: r.id, staffId: r.staff_id, docType: r.doc_type, documentTypeId: r.document_type_id,
      typeName: r.type_name ?? null, docNumberMasked: r.doc_number_masked, expiresOn: r.expires_on,
      status: r.status, currentVersion: r.current_version, notes: r.notes ?? null,
      fileName: r.file_name, mimeType: r.mime_type, sizeBytes: r.size_bytes,
      hasFullNumber: r.has_full_number ?? false,
      uploadedBy: r.uploaded_by, updatedBy: r.updated_by, createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  private mapType(r: Record<string, unknown>) {
    return {
      id: r.id, key: r.key, name: r.name, isMandatory: r.is_mandatory,
      requiresNumber: r.requires_number, requiresExpiry: r.requires_expiry,
      sortOrder: r.sort_order, isActive: r.is_active,
    };
  }
}
