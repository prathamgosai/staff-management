-- ROLLBACK for 025_perf_and_integrity.sql
-- Reverses the indexes and CHECK constraints. Intentionally does NOT drop the
-- users.pending_approval / ticket_number columns: those hold real data on the
-- live DB and predate this migration (025 only reconciled DBs that were missing
-- them). Drop them by hand only if you are certain no data depends on them.
BEGIN;

DROP INDEX IF EXISTS idx_users_lower_email;
DROP INDEX IF EXISTS idx_staff_lower_employee_id;
DROP INDEX IF EXISTS idx_refresh_tokens_token_hash;
DROP INDEX IF EXISTS idx_refresh_tokens_user;

ALTER TABLE IF EXISTS staffing_ratios                  DROP CONSTRAINT IF EXISTS chk_staffing_ratios_pax_pos;
ALTER TABLE IF EXISTS labor_ratio_configs              DROP CONSTRAINT IF EXISTS chk_labor_ratio_pax_pos;
ALTER TABLE IF EXISTS staff_requirement_configurations DROP CONSTRAINT IF EXISTS chk_srq_guests_pos;
ALTER TABLE IF EXISTS ratio_templates                  DROP CONSTRAINT IF EXISTS chk_ratio_tpl_guests_pos;
ALTER TABLE IF EXISTS tenant_settings                  DROP CONSTRAINT IF EXISTS chk_tenant_settings_divisor_pos;

COMMIT;
