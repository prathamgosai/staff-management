-- ============================================================================
-- APPLY-ALL-016-023.sql  —  paste this whole file into the Supabase SQL editor
-- and Run ONCE. Sets up the entire Workforce-Intelligence schema (documents,
-- capacity, per-role ratios, staffing engine, predictor, transfers) + demo seed.
-- Safe/idempotent. If any single block errors, run that migration's file alone.
-- (013–015 are unrelated pre-existing pending migrations — apply separately if you
--  need password-reset / kiosk; NOT required for PAX/staffing.)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 016_staff_documents.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- 017_outlet_capacity.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 017_outlet_capacity.sql
-- Outlet capacity model — the inputs for the required-vs-actual staffing analysis
-- (Tasks 3–5, 7). Adds table/pax capacity to dine-in outlets, a post→category map, and
-- tunable per-category staffing ratios.
--
--   • outlets.total_tables / max_pax — NULL means "not a dine-in outlet / excluded from the
--     capacity model" (bakeries, kitchens, ODC, etc. keep NULL).
--   • post_category_map(tenant_id, post, category) — seeded from the ACTUAL 13 positions in
--     this DB (positions.name). The spec's imagined posts (Pizza/WOK/Sushi Chef, Pass, Sides,
--     Barista, Guest Relations, Watchman…) do NOT exist here, so the map is built from the real
--     taxonomy. Lookup is case-insensitive in code; unmapped/NULL posts resolve to 'General'.
--   • staffing_ratios(tenant_id, category, pax_per_staff, min_staff) — seeded with the spec's
--     calibrated defaults; admins tune them in the UI. NOTE: this group has NO Bar/Barista
--     position, so the 'Bar' category has 0 actual staff — its ratio is a placeholder to zero
--     out or retune once drinks roles are tagged.
--   • Seeds the 6 dine-in outlets' capacity BY CODE (stable id), guarded on max_pax IS NULL so a
--     re-run — or a later admin edit — is never clobbered. VERIFY comment precedes the block.
--
-- Reuses existing permissions (NO new key): read surfaces gate on allocation:read (already held
-- by admin/hr/head_of_house); ratio edits gate on roles:manage (same as /account-types).
-- Transactional; idempotent; ships a matching _ROLLBACK.
BEGIN;

-- ── Outlet capacity columns ───────────────────────────────────────────────────
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS total_tables INTEGER;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS max_pax      INTEGER;

-- ── Post → category map ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_category_map (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    post      TEXT NOT NULL,
    category  TEXT NOT NULL,
    PRIMARY KEY (tenant_id, post)
);

INSERT INTO post_category_map (tenant_id, post, category)
SELECT t.id, x.post, x.category
FROM tenants t
CROSS JOIN (VALUES
    ('Head Chef',           'Kitchen'),
    ('Chef de Partie',      'Kitchen'),
    ('Cook',                'Kitchen'),
    ('Kitchen Helper',      'Kitchen'),
    ('Kitchen Prep Staff',  'Kitchen'),
    ('R&D Chef',            'Kitchen'),
    ('Service Crew',        'Service'),
    ('Senior Service Crew', 'Service'),
    ('Cashier',             'Service'),
    ('Part-Time Crew',      'Service'),
    ('Outlet Manager',      'Management'),
    ('Assistant Manager',   'Management'),
    ('ODC Staff',           'Support')
) AS x(post, category)
ON CONFLICT (tenant_id, post) DO NOTHING;

-- ── Per-category staffing ratios ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staffing_ratios (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category      TEXT NOT NULL,
    pax_per_staff NUMERIC(6,2) NOT NULL,
    min_staff     INTEGER NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, category)
);

INSERT INTO staffing_ratios (tenant_id, category, pax_per_staff, min_staff)
SELECT t.id, x.category, x.pax_per_staff, x.min_staff
FROM tenants t
CROSS JOIN (VALUES
    ('Kitchen',      8.8,   4),
    ('Service',     16.6,   2),
    ('Bar',         28.0,   1),
    ('Management', 113.0,   1),
    ('Support',     15.6,   2),
    ('General',     28.0,   0)
) AS x(category, pax_per_staff, min_staff)
ON CONFLICT (tenant_id, category) DO NOTHING;

-- ── Seed the 6 dine-in outlets' capacity (owner-provided, cross-checked to floor plans) ──
-- VERIFY: SELECT id, code, name FROM outlets WHERE code IN ('CAP-PIL','CAP-VES','CAP-AMB','CAP-UNI','AIK-SUR','AIK-AHM');
-- Guarded on max_pax IS NULL: a re-run, or any later admin capacity edit, is preserved.
UPDATE outlets SET total_tables = 13, max_pax =  72 WHERE code = 'CAP-PIL' AND max_pax IS NULL; -- Capiche Piplod
UPDATE outlets SET total_tables = 17, max_pax =  91 WHERE code = 'CAP-VES' AND max_pax IS NULL; -- Capiche Vesu
UPDATE outlets SET total_tables = 19, max_pax = 106 WHERE code = 'CAP-AMB' AND max_pax IS NULL; -- Capiche Ambli
UPDATE outlets SET total_tables = 22, max_pax = 116 WHERE code = 'CAP-UNI' AND max_pax IS NULL; -- Capiche Uni
UPDATE outlets SET total_tables = 15, max_pax =  81 WHERE code = 'AIK-SUR' AND max_pax IS NULL; -- Aiko Surat (spec "Aiko Pal")
UPDATE outlets SET total_tables = 20, max_pax =  97 WHERE code = 'AIK-AHM' AND max_pax IS NULL; -- Aiko Ahmedabad (spec "Aiko Ambli")

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
-- 018_tenant_settings.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 018_tenant_settings.sql
-- A tiny per-tenant key/value settings table for scalar tuning knobs that don't warrant
-- their own column. First user: `covers_per_on_duty_staff` — the Phase-1 forecast divides a
-- day's forecast pax by this to suggest on-duty staff (default 10, editable on the Staffing
-- ratios page). Tune it after the first pax import.
-- Transactional; idempotent; ships a matching _ROLLBACK.
BEGIN;

CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key       TEXT NOT NULL,
    value     NUMERIC NOT NULL,
    PRIMARY KEY (tenant_id, key)
);

INSERT INTO tenant_settings (tenant_id, key, value)
SELECT id, 'covers_per_on_duty_staff', 10
FROM tenants
ON CONFLICT (tenant_id, key) DO NOTHING;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
-- 019_documents_domain.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- 020_restaurant_config_ratios.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 020_restaurant_config_ratios.sql
-- Restaurant Configuration & Staffing Ratios (Feature 2 + part of Feature 7).
--   • restaurant_categories       — extensible cuisine/format lookup (Italian, Asian, …).
--   • restaurant_configurations   — 1:1 per outlet: category, area, kitchen size, pax capacities,
--                                   + optional per-restaurant threshold/basis overrides (PLAN §13.4).
--   • staff_requirement_configurations — per-restaurant, per-ROLE guests-per-staff + min/max floor
--                                   (the finer-grained sibling of the category-level staffing_ratios
--                                   from 017; NOT a replacement — the engine resolves role → category
--                                   → company default).
--   • staff_requirement_config_history — immutable who/when/old→new ratio change log.
--   • ratio_templates             — category → role default ratios, to prefill new outlets.
--   • permission `staffing:ratios` — edit restaurant config + ratios (admin/hr/head_of_house).
--
-- ADDITIVE ONLY. Does not touch existing tables (the never-used labor_ratio_configs scaffold is
-- consciously superseded, left in place). Soft delete on new tables. Runs after 019. Reversible.
BEGIN;

-- ── restaurant_categories (lookup) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurant_categories (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (tenant_id, name)
);
DROP TRIGGER IF EXISTS trg_restaurant_categories_updated_at ON restaurant_categories;
CREATE TRIGGER trg_restaurant_categories_updated_at BEFORE UPDATE ON restaurant_categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO restaurant_categories (tenant_id, name, sort_order)
SELECT t.id, x.name, x.sort_order
FROM tenants t
CROSS JOIN (VALUES
    ('Italian', 1), ('Asian', 2), ('Café', 3), ('Cloud Kitchen', 4),
    ('Fine Dining', 5), ('Casual Dining', 6), ('Fast Casual', 7)
) AS x(name, sort_order)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ── restaurant_configurations (1:1 outlet) ────────────────────────────────────
-- Does NOT duplicate outlets.seating_capacity / operating_hours / max_pax / total_tables.
CREATE TABLE IF NOT EXISTS restaurant_configurations (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id         UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    category_id       UUID REFERENCES restaurant_categories(id),
    area_sqft         INTEGER,
    kitchen_size_sqft INTEGER,
    avg_daily_pax     INTEGER,
    peak_pax          INTEGER,
    lunch_capacity    INTEGER,
    dinner_capacity   INTEGER,
    -- Optional per-restaurant overrides; NULL = fall back to the tenant-wide default.
    pax_basis         TEXT CHECK (pax_basis IN ('peak_period','average_daily')),
    t_excess          NUMERIC(6,3),
    t_minor           NUMERIC(6,3),
    created_by        UUID REFERENCES users(id),
    updated_by        UUID REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ,
    UNIQUE (outlet_id)
);
DROP TRIGGER IF EXISTS trg_restaurant_configurations_updated_at ON restaurant_configurations;
CREATE TRIGGER trg_restaurant_configurations_updated_at BEFORE UPDATE ON restaurant_configurations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_restaurant_config_tenant ON restaurant_configurations (tenant_id);

-- ── staff_requirement_configurations (per outlet × role) ──────────────────────
CREATE TABLE IF NOT EXISTS staff_requirement_configurations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id       UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    position_id     UUID NOT NULL REFERENCES positions(id),
    guests_per_staff NUMERIC(6,2) NOT NULL,
    min_staff       INTEGER NOT NULL DEFAULT 0,
    max_staff       INTEGER,
    created_by      UUID REFERENCES users(id),
    updated_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
DROP TRIGGER IF EXISTS trg_staff_req_config_updated_at ON staff_requirement_configurations;
CREATE TRIGGER trg_staff_req_config_updated_at BEFORE UPDATE ON staff_requirement_configurations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_staff_req_config_outlet ON staff_requirement_configurations (outlet_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_req_config_active
    ON staff_requirement_configurations (outlet_id, position_id) WHERE deleted_at IS NULL;

-- ── ratio change history (immutable) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_requirement_config_history (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id             UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    position_id           UUID NOT NULL REFERENCES positions(id),
    old_guests_per_staff  NUMERIC(6,2),
    new_guests_per_staff  NUMERIC(6,2),
    old_min_staff         INTEGER,
    new_min_staff         INTEGER,
    changed_by            UUID REFERENCES users(id),
    changed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_req_history_outlet ON staff_requirement_config_history (outlet_id, changed_at DESC);

-- ── ratio_templates (category → role) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ratio_templates (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id      UUID NOT NULL REFERENCES restaurant_categories(id) ON DELETE CASCADE,
    position_id      UUID NOT NULL REFERENCES positions(id),
    guests_per_staff NUMERIC(6,2) NOT NULL,
    min_staff        INTEGER NOT NULL DEFAULT 0,
    created_by       UUID REFERENCES users(id),
    updated_by       UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);
DROP TRIGGER IF EXISTS trg_ratio_templates_updated_at ON ratio_templates;
CREATE TRIGGER trg_ratio_templates_updated_at BEFORE UPDATE ON ratio_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE UNIQUE INDEX IF NOT EXISTS uq_ratio_template_active
    ON ratio_templates (category_id, position_id) WHERE deleted_at IS NULL;

-- ── permission: staffing:ratios (edit config + ratios) ────────────────────────
INSERT INTO role_permissions (tenant_id, role, permission)
SELECT t.id, x.role::user_role, 'staffing:ratios'
FROM tenants t
CROSS JOIN (VALUES ('admin'), ('hr'), ('head_of_house')) AS x(role)
ON CONFLICT (tenant_id, role, permission) DO NOTHING;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
-- 021_staffing_snapshots.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 021_staffing_snapshots.sql
-- Real-Time Staffing Engine persistence (Feature 3/4). staffing_snapshots stores the daily
-- per-outlet, per-role engine output so trend charts (30/90-day) read persisted history rather
-- than recomputing, and the company dashboard can serve pre-aggregated numbers.
--
-- Also seeds the engine's status thresholds into the existing tenant_settings (018) KV:
--   t_excess = 1     — excess within this is still GREEN (perfect)
--   t_minor  = 0.15  — shortage/required at or below this is YELLOW (minor), else RED
-- (pax basis stays per-outlet via restaurant_configurations.pax_basis, defaulting to peak_period
-- in code — no string setting needed yet.)
--
-- ADDITIVE + reversible. Runs after 020.
BEGIN;

CREATE TABLE IF NOT EXISTS staffing_snapshots (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id        UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    snapshot_date    DATE NOT NULL,
    position_id      UUID NOT NULL REFERENCES positions(id),
    required         INTEGER NOT NULL DEFAULT 0,
    current_staff    INTEGER NOT NULL DEFAULT 0,
    present          INTEGER NOT NULL DEFAULT 0,
    on_leave         INTEGER NOT NULL DEFAULT 0,
    transferred_in   INTEGER NOT NULL DEFAULT 0,
    transferred_out  INTEGER NOT NULL DEFAULT 0,
    available        INTEGER NOT NULL DEFAULT 0,
    shortage         INTEGER NOT NULL DEFAULT 0,
    excess           INTEGER NOT NULL DEFAULT 0,
    vacant           INTEGER NOT NULL DEFAULT 0,
    status           TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (outlet_id, snapshot_date, position_id)
);
-- Trend reads: one outlet over a date range; company rollups: whole tenant on a date.
CREATE INDEX IF NOT EXISTS idx_staffing_snapshots_outlet_date ON staffing_snapshots (outlet_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_staffing_snapshots_tenant_date ON staffing_snapshots (tenant_id, snapshot_date);

-- Seed engine thresholds (idempotent; tolerate 018 not yet applied by guarding on the table).
INSERT INTO tenant_settings (tenant_id, key, value)
SELECT t.id, k.key, k.value
FROM tenants t
CROSS JOIN (VALUES ('t_excess', 1), ('t_minor', 0.15)) AS k(key, value)
ON CONFLICT (tenant_id, key) DO NOTHING;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
-- 022_predictor_transfers.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 022_predictor_transfers.sql
-- Staff Predictor (Feature 5) + Intelligent Transfer Recommendations (Feature 6) + part of F7.
--   • role_salary_configs      — role → average monthly salary (HR-editable), for cost estimation.
--   • staff_predictions        — every predictor run (inputs+outputs+strategy_version) for training data.
--   • transfer_recommendations — persisted, scored cross-outlet move suggestions with a status
--                                lifecycle (pending/accepted/rejected/executed). Accepting deep-links
--                                into the existing /allocation transfer flow — no duplicated logic.
--   • permission `predictions:run` — Admin/HR/Restaurant Manager may run the predictor.
--
-- ADDITIVE + reversible. Runs after 021. Soft delete on the config/prediction/recommendation tables.
BEGIN;

-- ── role_salary_configs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_salary_configs (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    position_id        UUID NOT NULL REFERENCES positions(id),
    avg_monthly_salary NUMERIC(12,2) NOT NULL,
    currency           TEXT NOT NULL DEFAULT 'INR',
    effective_from     DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by         UUID REFERENCES users(id),
    updated_by         UUID REFERENCES users(id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ
);
DROP TRIGGER IF EXISTS trg_role_salary_configs_updated_at ON role_salary_configs;
CREATE TRIGGER trg_role_salary_configs_updated_at BEFORE UPDATE ON role_salary_configs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- One active salary per (position, effective_from).
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_salary_active
    ON role_salary_configs (position_id, effective_from) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_role_salary_position ON role_salary_configs (position_id, effective_from DESC);

-- ── staff_predictions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_predictions (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    inputs           JSONB NOT NULL,
    outputs          JSONB NOT NULL,
    strategy_version TEXT NOT NULL,
    created_by       UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_staff_predictions_tenant ON staff_predictions (tenant_id, created_at DESC);

-- ── transfer_recommendations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfer_recommendations (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    from_outlet_id    UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    to_outlet_id      UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    position_id       UUID NOT NULL REFERENCES positions(id),
    headcount         INTEGER NOT NULL,
    confidence        TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
    reason            TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','executed')),
    generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acted_by          UUID REFERENCES users(id),
    acted_at          TIMESTAMPTZ,
    staff_transfer_id UUID REFERENCES staff_transfers(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ
);
DROP TRIGGER IF EXISTS trg_transfer_recommendations_updated_at ON transfer_recommendations;
CREATE TRIGGER trg_transfer_recommendations_updated_at BEFORE UPDATE ON transfer_recommendations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_transfer_recs_status ON transfer_recommendations (status, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_recs_from ON transfer_recommendations (from_outlet_id);
CREATE INDEX IF NOT EXISTS idx_transfer_recs_to ON transfer_recommendations (to_outlet_id);
-- Idempotent regeneration: at most one PENDING rec per (from,to,role).
CREATE UNIQUE INDEX IF NOT EXISTS uq_transfer_rec_pending
    ON transfer_recommendations (from_outlet_id, to_outlet_id, position_id) WHERE status = 'pending' AND deleted_at IS NULL;

-- ── permission: predictions:run ───────────────────────────────────────────────
INSERT INTO role_permissions (tenant_id, role, permission)
SELECT t.id, x.role::user_role, 'predictions:run'
FROM tenants t
CROSS JOIN (VALUES ('admin'), ('hr'), ('head_of_house')) AS x(role)
ON CONFLICT (tenant_id, role, permission) DO NOTHING;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
-- 023_wi_seed_and_perf.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 023_wi_seed_and_perf.sql
-- Phase 5 — demo seed + performance indexes for the Workforce Intelligence extension.
--   • Seeds restaurant_configurations for every dine-in outlet (category by brand, capacities
--     derived from the existing max_pax/total_tables) so the staffing dashboard + predictor light
--     up on the real 6 outlets without hand-entry.
--   • Seeds role_salary_configs with plausible ₹ averages per role (by staff-category) so the
--     predictor shows payroll immediately. HR tunes both afterwards.
--   • Adds composite indexes for the engine's hot grouped queries.
--
-- ADDITIVE + idempotent (guarded / ON CONFLICT). Runs after 022. Seed values are DEMO defaults —
-- tune on the outlet pages + Role-salaries once real numbers are known.
BEGIN;

-- ── restaurant_configurations (per dine-in outlet) ───────────────────────────
INSERT INTO restaurant_configurations
  (tenant_id, outlet_id, category_id, area_sqft, kitchen_size_sqft, avg_daily_pax, peak_pax, lunch_capacity, dinner_capacity)
SELECT o.tenant_id, o.id, rc.id,
       COALESCE(o.total_tables, 20) * 100,                       -- ~100 sqft/table (demo)
       ROUND(COALESCE(o.total_tables, 20) * 100 * 0.22),         -- kitchen ~22% of floor
       ROUND(o.max_pax * 1.5),                                   -- ~1.5 turns/day
       o.max_pax,                                                -- peak
       ROUND(o.max_pax * 0.8),                                   -- lunch
       o.max_pax                                                 -- dinner (peak)
FROM outlets o
JOIN restaurant_categories rc
  ON rc.tenant_id = o.tenant_id
 AND rc.name = CASE WHEN o.name ILIKE '%aiko%' THEN 'Asian' ELSE 'Casual Dining' END
 AND rc.deleted_at IS NULL
WHERE o.is_active = true AND o.max_pax IS NOT NULL
ON CONFLICT (outlet_id) DO NOTHING;

-- ── role_salary_configs (₹ average per role, by staff-category) ──────────────
-- Fixed effective_from so the seed is idempotent; HR adds a newer effective-dated row to change.
INSERT INTO role_salary_configs (tenant_id, position_id, avg_monthly_salary, effective_from)
SELECT p.tenant_id, p.id,
       CASE COALESCE(pcm.category, 'General')
         WHEN 'Management' THEN 42000
         WHEN 'Kitchen'    THEN 22000
         WHEN 'Bar'        THEN 21000
         WHEN 'Service'    THEN 18000
         WHEN 'Support'    THEN 16000
         ELSE 15000
       END,
       DATE '2026-01-01'
FROM positions p
LEFT JOIN post_category_map pcm ON pcm.tenant_id = p.tenant_id AND LOWER(pcm.post) = LOWER(p.name)
WHERE p.is_active = true
ON CONFLICT (position_id, effective_from) WHERE deleted_at IS NULL DO NOTHING;

-- ── performance indexes for the engine's grouped reads ───────────────────────
-- current-staff-by-outlet-and-role (active only) — the engine's biggest grouped scan.
CREATE INDEX IF NOT EXISTS idx_staff_outlet_position_active
  ON staff (current_outlet_id, position_id) WHERE employment_status = 'active';
-- present-today lookups already covered by idx_attendance_outlet_date (001); add a status-aware one.
CREATE INDEX IF NOT EXISTS idx_attendance_outlet_date_status
  ON attendance_records (outlet_id, date, status);
-- approved leave overlapping a date, by staff.
CREATE INDEX IF NOT EXISTS idx_leave_status_dates
  ON leave_requests (status, start_date, end_date);
-- transfers effective on a date, by destination.
CREATE INDEX IF NOT EXISTS idx_transfers_to_effective
  ON staff_transfers (to_outlet_id, effective_date);

COMMIT;


