-- 016_staff_documents.sql
-- Staff Documents — a per-staff document vault (Aadhaar, PAN, bank passbook, contract…).
-- Reconciles the empty 001_schema `staff_documents` scaffold (an external `file_url`
-- model) into an in-DB base64 store with masking, MIME/size metadata and tenant scoping —
-- matching how staff avatars are already stored (base64 in a TEXT column).
--
--   • The 001 table was an UNUSED scaffold (0 rows in the live DB), so it is dropped and
--     recreated. A file's bytes live in content_base64; LIST queries MUST never select it
--     (same rule the staff list already follows for avatar_url).
--   • Aadhaar is a regulated identifier (Aadhaar Act / DPDP 2023): the API persists ONLY a
--     masked last-4 (XXXX-XXXX-1234); full numbers are never stored — see
--     staff-documents.service.ts maskNumber().
--   • Seeds a new `staff:documents` permission for admin + hr (the current 6-role set from
--     migration 010). super_admin is implicitly '*'. The key is also registered in
--     packages/shared PERMISSION_CATALOG so the Account Types page renders a toggle and the
--     server-side validator accepts it.
-- Transactional; ships a matching _ROLLBACK.
BEGIN;

-- Empty scaffold from 001_schema (file_url model) — safe to drop and recreate.
DROP TABLE IF EXISTS staff_documents;

CREATE TABLE staff_documents (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    staff_id          UUID NOT NULL REFERENCES staff(id)   ON DELETE CASCADE,
    doc_type          TEXT NOT NULL CHECK (doc_type IN
                        ('aadhaar','pan','bank_passbook','driving_license','passport',
                         'voter_id','police_verification','contract','other')),
    doc_number_masked TEXT,                       -- aadhaar: server stores last-4 only
    expires_on        DATE,                       -- optional (licenses/passports)
    file_name         TEXT NOT NULL,
    mime_type         TEXT NOT NULL CHECK (mime_type IN
                        ('application/pdf','image/jpeg','image/png','image/webp')),
    size_bytes        INTEGER NOT NULL,
    content_base64    TEXT NOT NULL,              -- raw base64 payload; NEVER in list SQL
    uploaded_by       UUID NOT NULL REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staff_documents_staff ON staff_documents (staff_id);

-- New permission key: manage staff documents. Granted to admin + hr (migration-010 roles);
-- super_admin is implicitly '*'. Idempotent so a re-run is a no-op.
INSERT INTO role_permissions (tenant_id, role, permission)
SELECT t.id, x.role::user_role, x.permission
FROM tenants t
CROSS JOIN (VALUES
    ('admin','staff:documents'),
    ('hr','staff:documents')
) AS x(role, permission)
ON CONFLICT (tenant_id, role, permission) DO NOTHING;

COMMIT;
