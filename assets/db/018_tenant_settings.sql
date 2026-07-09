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
