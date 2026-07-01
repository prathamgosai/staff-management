-- 010_role_types.sql
-- Restructures account types (user_role enum) to the new set:
--   super_admin, admin, hr, head_of_house, chef, employee
-- Removes: operations_head, outlet_manager, department_head, viewer.
-- Renames: hr_manager -> hr.
-- Existing users are remapped; role_permissions is rebuilt for the new set.
-- All DDL below is transactional in PostgreSQL, so a failure rolls back cleanly.
BEGIN;

-- 1) Swap the enum type.
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
ALTER TYPE user_role RENAME TO user_role_old;
CREATE TYPE user_role AS ENUM ('super_admin','admin','hr','head_of_house','chef','employee');

-- 2) Convert users.role, remapping the removed/renamed roles onto the new set.
ALTER TABLE users
  ALTER COLUMN role TYPE user_role
  USING (
    CASE role::text
      WHEN 'hr_manager'      THEN 'hr'
      WHEN 'operations_head' THEN 'admin'
      WHEN 'outlet_manager'  THEN 'head_of_house'
      WHEN 'department_head' THEN 'chef'
      WHEN 'viewer'          THEN 'employee'
      ELSE role::text                       -- super_admin, employee pass through
    END::user_role
  );
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'employee';

-- 3) Rebuild the permission matrix for the new roles.
--    (super_admin is intentionally absent — it always implies "*" in code.)
DELETE FROM role_permissions;
ALTER TABLE role_permissions ALTER COLUMN role TYPE user_role USING role::text::user_role;

INSERT INTO role_permissions (tenant_id, role, permission)
SELECT t.id, x.role::user_role, x.permission
FROM tenants t
CROSS JOIN (VALUES
    -- admin: full access
    ('admin','staff:read'),('admin','staff:write'),
    ('admin','outlet:read'),('admin','outlet:write'),
    ('admin','schedule:read'),('admin','schedule:write'),('admin','schedule:publish'),('admin','schedule:read:own'),
    ('admin','attendance:read'),('admin','attendance:write'),('admin','attendance:read:own'),
    ('admin','leave:read'),('admin','leave:approve'),('admin','leave:request'),('admin','leave:read:own'),
    ('admin','forecast:read'),('admin','forecast:write'),
    ('admin','allocation:read'),('admin','allocation:write'),
    ('admin','reports:read'),('admin','reports:export'),
    ('admin','notifications:send'),
    ('admin','accounts:manage'),('admin','roles:manage'),
    -- hr: full access
    ('hr','staff:read'),('hr','staff:write'),
    ('hr','outlet:read'),('hr','outlet:write'),
    ('hr','schedule:read'),('hr','schedule:write'),('hr','schedule:publish'),('hr','schedule:read:own'),
    ('hr','attendance:read'),('hr','attendance:write'),('hr','attendance:read:own'),
    ('hr','leave:read'),('hr','leave:approve'),('hr','leave:request'),('hr','leave:read:own'),
    ('hr','forecast:read'),('hr','forecast:write'),
    ('hr','allocation:read'),('hr','allocation:write'),
    ('hr','reports:read'),('hr','reports:export'),
    ('hr','notifications:send'),
    ('hr','accounts:manage'),('hr','roles:manage'),
    -- head_of_house: front-of-house manager (was outlet_manager)
    ('head_of_house','staff:read'),
    ('head_of_house','outlet:read'),
    ('head_of_house','schedule:read'),('head_of_house','schedule:write'),('head_of_house','schedule:publish'),
    ('head_of_house','attendance:read'),('head_of_house','attendance:write'),
    ('head_of_house','leave:read'),('head_of_house','leave:approve'),
    ('head_of_house','forecast:read'),
    ('head_of_house','allocation:read'),
    ('head_of_house','reports:read'),
    ('head_of_house','notifications:send'),
    -- chef: kitchen lead (was department_head)
    ('chef','staff:read'),
    ('chef','schedule:read'),('chef','schedule:write'),
    ('chef','attendance:read'),
    ('chef','leave:read'),('chef','leave:approve'),
    ('chef','reports:read'),
    -- employee: self-service
    ('employee','schedule:read:own'),
    ('employee','attendance:read:own'),
    ('employee','leave:read:own'),('employee','leave:request')
) AS x(role, permission)
ON CONFLICT (tenant_id, role, permission) DO NOTHING;

-- 4) Drop the retired enum.
DROP TYPE user_role_old;

COMMIT;
