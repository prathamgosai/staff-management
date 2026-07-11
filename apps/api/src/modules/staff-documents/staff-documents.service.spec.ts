import { NotFoundException } from "@nestjs/common";
import { StaffDocumentsService } from "./staff-documents.service";
import type { AuthUser } from "@workforceiq/shared";

/**
 * Focused unit tests for create()'s branching — the heart of the upload/multiples feature.
 * The DB pool, crypto and storage are mocked; we assert on the SQL the service runs and the
 * params it passes. Crypto is disabled so bytes take the plaintext dev-fallback (no storage I/O).
 */
type QueryResult = { rows: Record<string, unknown>[]; rowCount?: number };
type QueryImpl = (sql: string, params?: unknown[]) => Promise<QueryResult>;

// A minimal but VALID JPEG header (FF D8 FF …) — sniffMime detects image/jpeg from these bytes,
// even though the DTO below declares image/webp (the real-world re-encode mismatch).
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0]).toString("base64");

const USER = { id: "u1", tenantId: "t1", role: "super_admin", permissions: ["*"], outletIds: [] } as unknown as AuthUser;
const STAFF = { rows: [{ id: "s1", user_id: null, current_outlet_id: "o1" }] };
const TYPE = { rows: [{ id: "type-1", name: "Aadhaar", is_mandatory: true, requires_number: false, requires_expiry: false }] };

function makeService(queryImpl: QueryImpl) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const db = {
    query: jest.fn((sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return queryImpl(sql, params);
    }),
  };
  const crypto = { isEnabled: () => false, encryptString: jest.fn() };
  const storage = { isConfigured: () => false };
  const config = { get: jest.fn((_k: string, d?: unknown) => d) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = new StaffDocumentsService(db as any, crypto as any, storage as any, config as any);
  return { svc, calls };
}

function dto(extra: Record<string, unknown> = {}) {
  return { docType: "aadhaar", fileName: "scan.jpg", mimeType: "image/webp", contentBase64: JPEG_B64, ...extra };
}

const archivedRow = {
  id: "doc-x", staff_id: "s1", doc_type: "aadhaar", document_type_id: "type-1", current_version: 1,
  storage_key: null, content_encrypted: null, content_base64: "old", size_bytes: 10,
  doc_number_masked: null, uploaded_by: "u1", created_at: new Date(0),
};

describe("StaffDocumentsService.create", () => {
  it("new upload inserts a document and stores the DETECTED mime, not the declared one", async () => {
    const { svc, calls } = makeService(async (sql) => {
      if (sql.includes("FROM staff WHERE id")) return STAFF;
      if (sql.includes("FROM document_types WHERE")) return TYPE;
      if (sql.includes("uuid_generate_v4")) return { rows: [{ id: "doc-new" }] };
      if (sql.includes("INSERT INTO staff_documents")) {
        return { rows: [{ id: "doc-new", staff_id: "s1", doc_type: "aadhaar", mime_type: "image/jpeg", file_name: "scan.jpg" }] };
      }
      return { rows: [] };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await svc.create(USER, "s1", dto() as any);
    expect(out.data.id).toBe("doc-new");

    const insert = calls.find((c) => c.sql.includes("INSERT INTO staff_documents"));
    expect(insert).toBeDefined();
    expect(insert!.params).toContain("image/jpeg"); // detected
    expect(insert!.params).not.toContain("image/webp"); // NOT the declared mime
    expect(insert!.params).toContain("scan.jpg"); // filename normalized to the detected type
    expect(calls.some((c) => c.sql.includes("INSERT INTO staff_document_versions"))).toBe(false);
  });

  it("replaceDocumentId versions THAT document (archive current, no brand-new row)", async () => {
    const { svc, calls } = makeService(async (sql) => {
      if (sql.includes("FROM staff WHERE id")) return STAFF;
      if (sql.includes("id=$1 AND staff_id=$2")) return { rows: [archivedRow] };
      if (sql.includes("FROM document_types WHERE")) return TYPE;
      if (sql.includes("INSERT INTO staff_document_versions")) return { rows: [] };
      if (sql.includes("UPDATE staff_documents")) return { rows: [{ id: "doc-x", staff_id: "s1", current_version: 2 }] };
      return { rows: [] };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await svc.create(USER, "s1", dto({ replaceDocumentId: "doc-x" }) as any);
    expect(out.data.id).toBe("doc-x");
    expect(calls.some((c) => c.sql.includes("INSERT INTO staff_document_versions"))).toBe(true);
    expect(calls.some((c) => c.sql.includes("UPDATE staff_documents"))).toBe(true);
    expect(calls.some((c) => c.sql.includes("INSERT INTO staff_documents"))).toBe(false);
  });

  it("throws NotFound when replaceDocumentId does not resolve to a live document", async () => {
    const { svc } = makeService(async (sql) => {
      if (sql.includes("FROM staff WHERE id")) return STAFF;
      if (sql.includes("id=$1 AND staff_id=$2")) return { rows: [] };
      return { rows: [] };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(svc.create(USER, "s1", dto({ replaceDocumentId: "missing" }) as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("falls back to versioning when the fresh insert hits the unique index (23505, pre-migration)", async () => {
    const { svc, calls } = makeService(async (sql) => {
      if (sql.includes("FROM staff WHERE id")) return STAFF;
      if (sql.includes("FROM document_types WHERE")) return TYPE;
      if (sql.includes("uuid_generate_v4")) return { rows: [{ id: "doc-new" }] };
      if (sql.includes("INSERT INTO staff_documents")) {
        const e = new Error("duplicate key") as Error & { code?: string };
        e.code = "23505";
        throw e;
      }
      if (sql.includes("staff_id=$1 AND tenant_id=$2 AND document_type_id=$3")) return { rows: [archivedRow] };
      if (sql.includes("INSERT INTO staff_document_versions")) return { rows: [] };
      if (sql.includes("UPDATE staff_documents")) return { rows: [{ id: "doc-x", staff_id: "s1", current_version: 2 }] };
      return { rows: [] };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await svc.create(USER, "s1", dto() as any);
    expect(out.data.id).toBe("doc-x");
    expect(calls.some((c) => c.sql.includes("INSERT INTO staff_document_versions"))).toBe(true);
  });
});
