-- 009_hr_admin_login.sql
-- Creates the HR admin login and gives the hr_manager account type FULL access.
-- Login on the web app by entering ID "bookendshr.admin.com" (the login page
-- auto-appends @workforceiq.app) with password "hradmin123".
-- Password hash is bcrypt(cost 12) of "hradmin123".
BEGIN;

-- 1) HR admin login account (idempotent: re-running refreshes the password/role/flags).
INSERT INTO users (tenant_id, email, name, password_hash, role, outlet_ids, is_active, pending_approval, must_change_password)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'bookendshr.admin.com@workforceiq.app',
  'HR Admin',
  '$2b$12$51EaEGdxqgcz50eAHTTrKeizs2UX0RksdGx6ILqckT4fbpN1vK5rS',
  'hr_manager'::user_role,
  '{}',
  TRUE,
  FALSE,
  FALSE
)
ON CONFLICT (tenant_id, email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role,
      is_active = TRUE,
      pending_approval = FALSE,
      must_change_password = FALSE,
      updated_at = NOW();

-- 2) Give hr_manager FULL access — every permission in the catalogue, for every tenant.
INSERT INTO role_permissions (tenant_id, role, permission)
SELECT t.id, 'hr_manager'::user_role, x.permission
FROM tenants t
CROSS JOIN (VALUES
    ('staff:read'), ('staff:write'),
    ('outlet:read'), ('outlet:write'),
    ('schedule:read'), ('schedule:write'), ('schedule:publish'), ('schedule:read:own'),
    ('attendance:read'), ('attendance:write'), ('attendance:read:own'),
    ('leave:read'), ('leave:approve'), ('leave:request'), ('leave:read:own'),
    ('forecast:read'), ('forecast:write'),
    ('allocation:read'), ('allocation:write'),
    ('reports:read'), ('reports:export'),
    ('notifications:send'),
    ('accounts:manage'), ('roles:manage')
) AS x(permission)
ON CONFLICT (tenant_id, role, permission) DO NOTHING;

COMMIT;
