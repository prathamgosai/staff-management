-- 011_staff_shift_overrides.sql
-- Per-staff manual shift assignment ("pin").
-- Lets a manager move ONE staff member off their rotation shift onto a specific
-- shift template (A/B/C) for their outlet, effective from a given week onward.
-- The weekly auto-rotation (SchedulingService.autoGenerateRotation) reads these
-- pins and assigns the pinned staff to their chosen shift instead of their
-- rotated group shift, so the manual move survives future rotations.
-- One active pin per staff member (re-moving a staff overwrites their pin).
-- All DDL below is transactional in PostgreSQL, so a failure rolls back cleanly.
BEGIN;

CREATE TABLE IF NOT EXISTS staff_shift_overrides (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id)         ON DELETE CASCADE,
    staff_id       UUID NOT NULL REFERENCES staff(id)           ON DELETE CASCADE,
    outlet_id      UUID NOT NULL REFERENCES outlets(id)         ON DELETE CASCADE,
    template_id    UUID NOT NULL REFERENCES shift_templates(id) ON DELETE CASCADE,
    effective_from DATE NOT NULL,
    created_by     UUID REFERENCES users(id),
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (staff_id)
);

-- Rotation reads pins by (outlet, tenant, effective_from) each week.
CREATE INDEX IF NOT EXISTS idx_staff_shift_overrides_lookup
    ON staff_shift_overrides (outlet_id, tenant_id, effective_from);

COMMIT;
