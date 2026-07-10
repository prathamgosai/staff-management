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
