-- ROLLBACK for 009: removes the HR admin login and reverts hr_manager to its
-- 008 baseline permissions (drops the extra "full access" grants).
BEGIN;

DELETE FROM users
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND email = 'bookendshr.admin.com@workforceiq.app';

DELETE FROM role_permissions
WHERE role = 'hr_manager'::user_role
  AND permission IN (
    'outlet:write', 'schedule:write', 'schedule:publish', 'schedule:read:own',
    'attendance:read:own', 'leave:request', 'leave:read:own',
    'forecast:read', 'forecast:write', 'notifications:send', 'accounts:manage'
  );

COMMIT;
