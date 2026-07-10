-- 019_documents_domain.sql
-- Employee Documents module (Feature 1 + part of Feature 7) — deepens the 016 staff-document
-- vault into a full compliance-grade store: a document_types lookup (mandatory/number/expiry
-- flags), a Valid/Expired/Pending status, version history (replace-never-deletes), an immutable
-- access audit log, application-layer encryption of document numbers, and a pluggable storage
-- reference (Supabase Storage `storage_key`, with an encrypted-in-DB fallback).
--
--   • ADDITIVE ONLY. No existing column/table is dropped or renamed. The single relaxation is
--     dropping the inline `doc_type` CHECK (so HR-defined types beyond the original 9 are
--     allowed) and making `content_base64` nullable (bytes now live in Storage or content_encrypted).
--   • Soft delete (`deleted_at`) is introduced on the NEW/extended document tables only.
--   • New permissions: `documents:status` (see completeness only — managers/supervisors) and
--     `documents:reveal` (unmask a full document number — admin/hr). Registered in
--     packages/shared PERMISSION_CATALOG so the Account Types page renders toggles.
--   • Runs AFTER 016 (which created the base staff_documents vault). Transactional; ships a
--     matching _ROLLBACK.
BEGIN;

-- ── 1. document_types lookup ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_types (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key             TEXT NOT NULL,                 -- stable machine key (matches staff_documents.doc_type)
    name            TEXT NOT NULL,                 -- human label, HR-editable
    is_mandatory    BOOLEAN NOT NULL DEFAULT FALSE,
    requires_number BOOLEAN NOT NULL DEFAULT FALSE,
    requires_expiry BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE (tenant_id, key)
);
DROP TRIGGER IF EXISTS trg_document_types_updated_at ON document_types;
CREATE TRIGGER trg_document_types_updated_at BEFORE UPDATE ON document_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed the 14 brief types for every tenant. Mandatory set (company-wide) = Aadhaar, PAN,
-- Bank Passbook (confirmed decision — PLAN §13.5). requires_number / requires_expiry follow
-- the real document's nature. Idempotent.
INSERT INTO document_types (tenant_id, key, name, is_mandatory, requires_number, requires_expiry, sort_order)
SELECT t.id, x.key, x.name, x.is_mandatory, x.requires_number, x.requires_expiry, x.sort_order
FROM tenants t
CROSS JOIN (VALUES
    ('aadhaar',             'Aadhaar Card',          TRUE,  TRUE,  FALSE,  1),
    ('pan',                 'PAN Card',              TRUE,  TRUE,  FALSE,  2),
    ('bank_passbook',       'Bank Passbook',         TRUE,  TRUE,  FALSE,  3),
    ('driving_license',     'Driving License',       FALSE, TRUE,  TRUE,   4),
    ('passport',            'Passport',              FALSE, TRUE,  TRUE,   5),
    ('resume',              'Resume',                FALSE, FALSE, FALSE,  6),
    ('offer_letter',        'Offer Letter',          FALSE, FALSE, FALSE,  7),
    ('appointment_letter',  'Appointment Letter',    FALSE, FALSE, FALSE,  8),
    ('police_verification', 'Police Verification',   FALSE, FALSE, TRUE,   9),
    ('medical_certificate', 'Medical Certificate',   FALSE, FALSE, TRUE,  10),
    ('education_certificate','Education Certificates',FALSE, FALSE, FALSE, 11),
    ('address_proof',       'Address Proof',         FALSE, FALSE, FALSE, 12),
    ('photo',               'Passport-size Photo',   FALSE, FALSE, FALSE, 13),
    ('other',               'Other',                 FALSE, FALSE, FALSE, 14)
) AS x(key, name, is_mandatory, requires_number, requires_expiry, sort_order)
ON CONFLICT (tenant_id, key) DO NOTHING;

-- ── 2. Extend staff_documents ─────────────────────────────────────────────────
-- Relax the 016 inline CHECK so HR-defined types (resume, offer_letter, …) are allowed;
-- the FK to document_types is now the source of truth. (Postgres auto-named the inline
-- constraint `staff_documents_doc_type_check`.)
ALTER TABLE staff_documents DROP CONSTRAINT IF EXISTS staff_documents_doc_type_check;

ALTER TABLE staff_documents
    ADD COLUMN IF NOT EXISTS document_type_id     UUID REFERENCES document_types(id),
    ADD COLUMN IF NOT EXISTS status               TEXT NOT NULL DEFAULT 'valid'
                                CHECK (status IN ('valid','expired','pending')),
    ADD COLUMN IF NOT EXISTS current_version      INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS notes                TEXT,
    ADD COLUMN IF NOT EXISTS doc_number_encrypted BYTEA,   -- app-layer AES-256-GCM (full number)
    ADD COLUMN IF NOT EXISTS storage_key          TEXT,    -- Supabase Storage object key (preferred)
    ADD COLUMN IF NOT EXISTS content_encrypted    BYTEA,   -- encrypted-in-DB fallback backend
    ADD COLUMN IF NOT EXISTS updated_by           UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS deleted_at           TIMESTAMPTZ;

-- Bytes now live in Supabase Storage (storage_key) or content_encrypted; the legacy 016
-- base64 column becomes optional.
ALTER TABLE staff_documents ALTER COLUMN content_base64 DROP NOT NULL;

-- Backfill the type FK from the legacy denormalized key (no-op on a fresh/empty vault).
UPDATE staff_documents sd
   SET document_type_id = dt.id
  FROM document_types dt
 WHERE dt.tenant_id = sd.tenant_id AND dt.key = sd.doc_type
   AND sd.document_type_id IS NULL;

DROP TRIGGER IF EXISTS trg_staff_documents_updated_at ON staff_documents;
CREATE TRIGGER trg_staff_documents_updated_at BEFORE UPDATE ON staff_documents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes: filter by type+status (Missing/Expired lists), expiry scan + 30-day widget,
-- and soft-delete-aware tenant scans.
CREATE INDEX IF NOT EXISTS idx_staff_documents_type_status ON staff_documents (document_type_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_documents_expires     ON staff_documents (expires_on);
CREATE INDEX IF NOT EXISTS idx_staff_documents_tenant_del  ON staff_documents (tenant_id, deleted_at);
-- One ACTIVE document per (staff, type). Replaces archive to a version instead of a 2nd row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_documents_active_type
    ON staff_documents (staff_id, document_type_id) WHERE deleted_at IS NULL;

-- ── 3. Version history (DocumentHistory) — replace never deletes ───────────────
CREATE TABLE IF NOT EXISTS staff_document_versions (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id       UUID NOT NULL REFERENCES staff_documents(id) ON DELETE CASCADE,
    version_no        INTEGER NOT NULL,
    storage_key       TEXT,
    content_encrypted BYTEA,
    content_base64    TEXT,                        -- only for versions archived from legacy rows
    file_name         TEXT NOT NULL,
    mime_type         TEXT NOT NULL,
    size_bytes        INTEGER NOT NULL,
    doc_number_masked TEXT,
    uploaded_by       UUID REFERENCES users(id),
    uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    replaced_by       UUID REFERENCES users(id),
    replaced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON staff_document_versions (document_id, version_no);

-- ── 4. Immutable access audit log ─────────────────────────────────────────────
-- Insert-only: every upload / view / download / reveal / replace / delete. No updated_at,
-- no deleted_at, no UPDATE path — it is an append-only ledger. document_id SET NULL on doc
-- delete so the log outlives the document.
CREATE TABLE IF NOT EXISTS document_access_logs (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id    UUID REFERENCES staff_documents(id) ON DELETE SET NULL,
    staff_id       UUID REFERENCES staff(id) ON DELETE SET NULL,
    actor_user_id  UUID REFERENCES users(id),
    action         TEXT NOT NULL CHECK (action IN
                     ('upload','view','download','reveal','replace','delete','denied')),
    ip_address     INET,
    user_agent     TEXT,
    detail         TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doc_access_document ON document_access_logs (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_access_actor    ON document_access_logs (tenant_id, actor_user_id, created_at DESC);

-- ── 5. New permission keys ────────────────────────────────────────────────────
-- documents:status → view completeness/status only (head_of_house/chef, outlet-scoped).
-- documents:reveal → unmask a full document number (admin/hr). super_admin is implicitly '*'.
INSERT INTO role_permissions (tenant_id, role, permission)
SELECT t.id, x.role::user_role, x.permission
FROM tenants t
CROSS JOIN (VALUES
    ('admin','documents:reveal'),
    ('hr','documents:reveal'),
    ('admin','documents:status'),
    ('hr','documents:status'),
    ('head_of_house','documents:status'),
    ('chef','documents:status')
) AS x(role, permission)
ON CONFLICT (tenant_id, role, permission) DO NOTHING;

COMMIT;
