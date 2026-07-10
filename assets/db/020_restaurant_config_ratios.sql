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
