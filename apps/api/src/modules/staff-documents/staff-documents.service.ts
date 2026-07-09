import {
  Injectable, Inject, NotFoundException, ForbiddenException,
  BadRequestException, PayloadTooLargeException,
} from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { allowedOutletIds } from "../../common/auth/outlet-scope";
import type { AuthUser } from "@workforceiq/shared";
import { CreateDocumentDto } from "./dto/create-document.dto";

const MAX_DECODED_BYTES = 2 * 1024 * 1024; // 2 MB decoded

/**
 * Staff document vault. Storage mirrors the avatar pattern (base64 in a TEXT column),
 * but content_base64 is NEVER returned by list queries — only by the dedicated
 * per-document content endpoint (perf: keeps list responses tiny; privacy: gated read).
 *
 * Access:
 *   - write/delete → callers holding `staff:documents` (admin/hr; super_admin via '*')
 *   - read         → those callers OR the staff member reading THEIR OWN documents
 *                    (matched via staff.user_id === caller.id)
 * All queries are tenant-filtered; non-owner access is additionally outlet-scoped.
 */
@Injectable()
export class StaffDocumentsService {
  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  private canManage(user: AuthUser): boolean {
    const perms = user.permissions ?? [];
    return user.role === "super_admin" || perms.includes("*") || perms.includes("staff:documents");
  }

  /**
   * Load the tenant-scoped staff row and authorize the caller. 404 (not 403) when the
   * staff member is outside the caller's outlet scope, so cross-outlet existence isn't
   * leaked. Returns the staff row so callers can reuse it.
   */
  private async authorizeStaff(user: AuthUser, staffId: string, mode: "read" | "write") {
    const res = await this.db.query(
      "SELECT id, user_id, current_outlet_id FROM staff WHERE id = $1 AND tenant_id = $2",
      [staffId, user.tenantId],
    );
    const staff = res.rows[0] as { id: string; user_id: string | null; current_outlet_id: string | null } | undefined;
    if (!staff) throw new NotFoundException(`Staff ${staffId} not found`);

    const isOwner = !!staff.user_id && staff.user_id === user.id;
    const canManage = this.canManage(user);

    if (mode === "write") {
      if (!canManage) throw new ForbiddenException("You do not have permission to manage staff documents.");
    } else if (!isOwner && !canManage) {
      throw new ForbiddenException("You do not have permission to view these documents.");
    }

    // Non-owner access (i.e. a manager viewing someone else) stays outlet-scoped.
    // Admins get null (all outlets) so this is a no-op for them. A scoped caller may
    // only reach staff in their outlets; a NULL current_outlet_id is treated as
    // out-of-scope (matches assertStaffInScope's SQL, where NULL = ANY(array) is not
    // true), so it fails CLOSED with a 404 rather than leaking unassigned staff.
    if (!isOwner) {
      const allowed = allowedOutletIds(user);
      if (allowed !== null && !(staff.current_outlet_id && allowed.includes(staff.current_outlet_id))) {
        throw new NotFoundException(`Staff ${staffId} not found`);
      }
    }
    return { staff, isOwner, canManage };
  }

  /** Metadata only — no content_base64. */
  async list(user: AuthUser, staffId: string) {
    await this.authorizeStaff(user, staffId, "read");
    const res = await this.db.query(
      `SELECT id, staff_id, doc_type, doc_number_masked, expires_on,
              file_name, mime_type, size_bytes, uploaded_by, created_at
       FROM staff_documents
       WHERE staff_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC`,
      [staffId, user.tenantId],
    );
    return { data: res.rows.map((r) => this.mapMeta(r)) };
  }

  /** The one place content_base64 is read; decoded to bytes for the caller. */
  async getContent(user: AuthUser, staffId: string, docId: string) {
    await this.authorizeStaff(user, staffId, "read");
    const res = await this.db.query(
      `SELECT mime_type, file_name, content_base64
       FROM staff_documents
       WHERE id = $1 AND staff_id = $2 AND tenant_id = $3`,
      [docId, staffId, user.tenantId],
    );
    const row = res.rows[0] as { mime_type: string; file_name: string; content_base64: string } | undefined;
    if (!row) throw new NotFoundException("Document not found");
    return {
      mimeType: row.mime_type,
      fileName: row.file_name,
      buffer: Buffer.from(row.content_base64, "base64"),
    };
  }

  async create(user: AuthUser, staffId: string, dto: CreateDocumentDto) {
    await this.authorizeStaff(user, staffId, "write");

    // Accept a raw base64 string or a full data URL; store just the base64 payload.
    const commaIdx = dto.contentBase64.indexOf(",");
    const base64 = dto.contentBase64.startsWith("data:") && commaIdx !== -1
      ? dto.contentBase64.slice(commaIdx + 1)
      : dto.contentBase64;

    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) throw new BadRequestException("File content is empty or not valid base64.");
    if (buffer.length > MAX_DECODED_BYTES) {
      throw new PayloadTooLargeException("File is too large. Maximum size is 2 MB.");
    }

    const numberMasked = this.maskNumber(dto.docType, dto.docNumber);

    const res = await this.db.query(
      `INSERT INTO staff_documents
         (tenant_id, staff_id, doc_type, doc_number_masked, expires_on,
          file_name, mime_type, size_bytes, content_base64, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, staff_id, doc_type, doc_number_masked, expires_on,
                 file_name, mime_type, size_bytes, uploaded_by, created_at`,
      [
        user.tenantId, staffId, dto.docType, numberMasked, dto.expiresOn ?? null,
        dto.fileName, dto.mimeType, buffer.length, base64, user.id,
      ],
    );
    return { data: this.mapMeta(res.rows[0]) };
  }

  async remove(user: AuthUser, staffId: string, docId: string): Promise<void> {
    await this.authorizeStaff(user, staffId, "write");
    const res = await this.db.query(
      "DELETE FROM staff_documents WHERE id = $1 AND staff_id = $2 AND tenant_id = $3",
      [docId, staffId, user.tenantId],
    );
    if (res.rowCount === 0) throw new NotFoundException("Document not found");
  }

  /** For /me: the caller's OWN documents, resolved via staff.user_id (never a client id). */
  async listOwn(user: AuthUser) {
    const staffRes = await this.db.query(
      "SELECT id FROM staff WHERE user_id = $1 AND tenant_id = $2",
      [user.id, user.tenantId],
    );
    const staffId = staffRes.rows[0]?.id as string | undefined;
    if (!staffId) throw new NotFoundException("No staff profile is linked to your account.");
    return this.list(user, staffId);
  }

  /**
   * Aadhaar: persist ONLY the masked last-4 (regulatory — see 016 header). All other
   * document numbers are stored as entered. Empty/absent → null.
   */
  private maskNumber(docType: string, raw?: string | null): string | null {
    if (!raw || !raw.trim()) return null;
    const value = raw.trim();
    if (docType === "aadhaar") {
      const last4 = value.replace(/\D/g, "").slice(-4);
      return last4 ? `XXXX-XXXX-${last4}` : null;
    }
    return value;
  }

  private mapMeta(r: Record<string, unknown>) {
    return {
      id: r.id,
      staffId: r.staff_id,
      docType: r.doc_type,
      docNumberMasked: r.doc_number_masked,
      expiresOn: r.expires_on,
      fileName: r.file_name,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      uploadedBy: r.uploaded_by,
      createdAt: r.created_at,
    };
  }
}
