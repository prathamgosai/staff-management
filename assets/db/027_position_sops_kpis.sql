-- 027_position_sops_kpis.sql
-- Role-level SOPs and KPIs.
--
-- Attached to POSITIONS, not staff: there are ~13 active positions but 248 active staff
-- (Cashier alone = 47 people). Per-staff rows would mean writing the same Cashier SOP 47
-- times and re-editing all 47 on every change. Each staff member inherits the SOPs/KPIs of
-- their position_id, so authoring happens once per role.
--
-- Column set mirrors the SOP/KPI template the owner supplied, so nothing in it is lost.
-- Ordered lists (steps, checks, mistakes) are text[] rather than a child table: they are
-- always read and written as a whole block, never queried individually.
--
-- Editing is gated on the existing staff:write permission; reading is open to any
-- authenticated user (a staff member must be able to read their own role's SOP). No new
-- permission key is introduced — an unseeded key would be inert.
-- Transactional; idempotent; ships a matching _ROLLBACK.
BEGIN;

CREATE TABLE IF NOT EXISTS position_sops (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    position_id            UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    name                   VARCHAR(160) NOT NULL,
    purpose                TEXT,
    inputs                 TEXT,
    procedure_steps        TEXT[] NOT NULL DEFAULT '{}',
    quality_checks         TEXT[] NOT NULL DEFAULT '{}',
    common_mistakes        TEXT[] NOT NULL DEFAULT '{}',
    exceptions_escalation  TEXT,
    documentation          TEXT,
    -- Free text, not an enum: real frequencies are messy ("every shift close", "on delivery").
    frequency              VARCHAR(60),
    time_target            VARCHAR(120),
    owner_label            VARCHAR(120),
    -- TRUE while the seeded draft is unreviewed, so the UI can say so plainly instead of
    -- presenting best-practice guesses as this restaurant's actual procedure.
    is_draft               BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order             INTEGER NOT NULL DEFAULT 0,
    created_by             UUID REFERENCES users(id),
    updated_by             UUID REFERENCES users(id),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at             TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS position_kpis (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    position_id            UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    name                   VARCHAR(160) NOT NULL,
    definition             TEXT,
    formula                TEXT,
    target_value           VARCHAR(120),
    measurement_frequency  VARCHAR(60),
    -- Where the number comes from. Seeds name the real table when one exists, and say so
    -- explicitly when it does not — a KPI with no source must not look measurable.
    data_source            TEXT,
    owner_label            VARCHAR(120),
    reporting_format       TEXT,
    below_target_action    TEXT,
    -- throughput | quality | timeliness | satisfaction | risk — the template's five areas.
    category               VARCHAR(30),
    -- FALSE when the data source is empty/absent today (e.g. anything reading
    -- attendance_records, which has no rows until staff start clocking in).
    is_measurable_today    BOOLEAN NOT NULL DEFAULT FALSE,
    is_draft               BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order             INTEGER NOT NULL DEFAULT 0,
    created_by             UUID REFERENCES users(id),
    updated_by             UUID REFERENCES users(id),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at             TIMESTAMPTZ
);

-- Hot path is "everything for one position", filtered to live rows.
CREATE INDEX IF NOT EXISTS position_sops_position_idx
    ON position_sops (position_id, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS position_kpis_position_idx
    ON position_kpis (position_id, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS position_sops_tenant_idx ON position_sops (tenant_id);
CREATE INDEX IF NOT EXISTS position_kpis_tenant_idx ON position_kpis (tenant_id);

COMMIT;
