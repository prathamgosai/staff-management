-- 011_staff_shift_overrides_ROLLBACK.sql
-- Reverses 011_staff_shift_overrides.sql.
BEGIN;

DROP TABLE IF EXISTS staff_shift_overrides;

COMMIT;
