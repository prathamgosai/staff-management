-- 030_calibrate_ratio_templates_ROLLBACK.sql
-- Removes the derived ratios, returning every category to the company defaults (and with them,
-- the identical-prediction / zero-payroll behaviour this migration fixed).
--
-- Deletes ONLY rows still untouched since seeding (created_by IS NULL). Any ratio a human has
-- since edited or added carries a created_by and survives — that is their tuning, not ours.
BEGIN;

DELETE FROM ratio_templates WHERE created_by IS NULL;

COMMIT;
