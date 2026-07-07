-- 013_force_password_reset.sql
-- Credential hygiene: the three seeded passwords are burned. Force a password reset
-- for every account still on a seeded password (one that has never been changed), so
-- the next login must set a new one that passes the strengthened policy.
--
--   • Adds users.password_updated_at (NULL = never changed since seed) if absent.
--   • Sets must_change_password = TRUE for every account with password_updated_at IS NULL,
--     EXCEPT super_admin (rotated manually — see Manual Steps). HR/admin were rotated
--     2026-06-29 but that isn't recorded per row, so they reset too (safer).
--   • The change-password flow stamps password_updated_at = NOW() (AuthService), so a
--     user who resets is not re-flagged on a re-run.
-- All DDL/DML is transactional; ships a matching _ROLLBACK.
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMPTZ;

UPDATE users
   SET must_change_password = TRUE,
       updated_at = NOW()
 WHERE password_updated_at IS NULL
   AND role <> 'super_admin'::user_role;

COMMIT;
