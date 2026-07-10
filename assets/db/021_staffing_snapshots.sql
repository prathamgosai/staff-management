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
