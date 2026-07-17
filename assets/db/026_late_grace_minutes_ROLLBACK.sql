-- 026_late_grace_minutes_ROLLBACK.sql
-- Removes the late_grace_minutes setting. resolveLateness() falls back to
-- DEFAULT_LATE_GRACE_MINUTES (10) when the row is absent, so clock-in keeps working
-- and simply stops being tenant-tunable.
BEGIN;

DELETE FROM tenant_settings WHERE key = 'late_grace_minutes';

COMMIT;
