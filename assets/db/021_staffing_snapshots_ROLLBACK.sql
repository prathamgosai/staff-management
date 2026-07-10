-- 021_staffing_snapshots_ROLLBACK.sql
-- Reverses 021. Drops the snapshot history and removes the seeded engine thresholds.
BEGIN;
DELETE FROM tenant_settings WHERE key IN ('t_excess', 't_minor');
DROP TABLE IF EXISTS staffing_snapshots;
COMMIT;
