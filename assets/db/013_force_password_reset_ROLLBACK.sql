-- 013_force_password_reset_ROLLBACK.sql
-- Reverses 013_force_password_reset.sql (schema only). must_change_password is left
-- as-is: a forced reset is a safe state (it never harms), and the pre-migration value
-- per row is not recorded, so we do not guess it back.
BEGIN;

ALTER TABLE users DROP COLUMN IF EXISTS password_updated_at;

COMMIT;
