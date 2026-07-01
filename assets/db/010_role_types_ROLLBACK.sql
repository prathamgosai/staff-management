-- ROLLBACK for 010: restores the previous 7-role enum and remaps users back.
-- (viewer had 0 users and is not recoverable per-row.) role_permissions is
-- emptied; re-run 008 (+009) to restore the prior matrix if needed.
BEGIN;

ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
ALTER TYPE user_role RENAME TO user_role_new;
CREATE TYPE user_role AS ENUM ('super_admin','operations_head','hr_manager','outlet_manager','department_head','employee','viewer');

ALTER TABLE users
  ALTER COLUMN role TYPE user_role
  USING (
    CASE role::text
      WHEN 'admin'         THEN 'operations_head'
      WHEN 'hr'            THEN 'hr_manager'
      WHEN 'head_of_house' THEN 'outlet_manager'
      WHEN 'chef'          THEN 'department_head'
      ELSE role::text                      -- super_admin, employee pass through
    END::user_role
  );
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'employee';

DELETE FROM role_permissions;
ALTER TABLE role_permissions ALTER COLUMN role TYPE user_role USING role::text::user_role;

DROP TYPE user_role_new;

COMMIT;
