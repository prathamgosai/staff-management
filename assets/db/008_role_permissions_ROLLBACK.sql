-- ROLLBACK for 008: drops the editable role→permission matrix.
-- Enforcement falls back to the hard-coded ROLE_PERMISSIONS constant.
BEGIN;
DROP TABLE IF EXISTS role_permissions;
COMMIT;
