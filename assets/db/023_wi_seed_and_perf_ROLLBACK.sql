-- 023_wi_seed_and_perf_ROLLBACK.sql
-- Reverses 023. Drops the perf indexes and removes the DEMO seed rows (only the ones this
-- migration inserted: role salaries dated 2026-01-01; restaurant_configurations for outlets
-- that have no per-role overrides yet are left in place if HR has since edited them —
-- delete-by-marker keeps user edits safe).
BEGIN;

DROP INDEX IF EXISTS idx_transfers_to_effective;
DROP INDEX IF EXISTS idx_leave_status_dates;
DROP INDEX IF EXISTS idx_attendance_outlet_date_status;
DROP INDEX IF EXISTS idx_staff_outlet_position_active;

-- Remove only the seed-dated salary rows.
DELETE FROM role_salary_configs WHERE effective_from = DATE '2026-01-01';

-- Remove seeded configs that were never edited (updated_at == created_at) to preserve HR edits.
DELETE FROM restaurant_configurations WHERE updated_at = created_at;

COMMIT;
