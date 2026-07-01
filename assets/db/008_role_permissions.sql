-- 008_role_permissions.sql
-- Makes the role→permission matrix editable at runtime (Account Types page).
-- Until now ROLE_PERMISSIONS lived only as a hard-coded constant in the shared
-- package; this table is the source of truth the API reads and the UI edits.
-- super_admin is intentionally NOT stored here — it always implies every
-- permission ("*") in code, so it can never be locked out.
BEGIN;

CREATE TABLE IF NOT EXISTS role_permissions (
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role        user_role   NOT NULL,
    permission  VARCHAR(60) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, role, permission)
);

-- Seed the current matrix for every existing tenant. Idempotent: re-running
-- only fills gaps, never clobbers edits an admin has already made.
INSERT INTO role_permissions (tenant_id, role, permission)
SELECT t.id, x.role::user_role, x.permission
FROM tenants t
CROSS JOIN (VALUES
    -- operations_head
    ('operations_head','staff:read'), ('operations_head','staff:write'),
    ('operations_head','outlet:read'), ('operations_head','outlet:write'),
    ('operations_head','schedule:read'), ('operations_head','schedule:write'), ('operations_head','schedule:publish'),
    ('operations_head','attendance:read'), ('operations_head','attendance:write'),
    ('operations_head','leave:read'), ('operations_head','leave:approve'),
    ('operations_head','forecast:read'), ('operations_head','forecast:write'),
    ('operations_head','allocation:read'), ('operations_head','allocation:write'),
    ('operations_head','reports:read'), ('operations_head','reports:export'),
    ('operations_head','notifications:send'),
    -- hr_manager
    ('hr_manager','staff:read'), ('hr_manager','staff:write'),
    ('hr_manager','outlet:read'),
    ('hr_manager','schedule:read'),
    ('hr_manager','attendance:read'), ('hr_manager','attendance:write'),
    ('hr_manager','leave:read'), ('hr_manager','leave:approve'),
    ('hr_manager','allocation:read'), ('hr_manager','allocation:write'),
    ('hr_manager','reports:read'), ('hr_manager','reports:export'),
    ('hr_manager','roles:manage'),
    -- outlet_manager
    ('outlet_manager','staff:read'),
    ('outlet_manager','outlet:read'),
    ('outlet_manager','schedule:read'), ('outlet_manager','schedule:write'), ('outlet_manager','schedule:publish'),
    ('outlet_manager','attendance:read'), ('outlet_manager','attendance:write'),
    ('outlet_manager','leave:read'), ('outlet_manager','leave:approve'),
    ('outlet_manager','forecast:read'),
    ('outlet_manager','allocation:read'),
    ('outlet_manager','reports:read'),
    ('outlet_manager','notifications:send'),
    -- department_head
    ('department_head','staff:read'),
    ('department_head','schedule:read'), ('department_head','schedule:write'),
    ('department_head','attendance:read'),
    ('department_head','leave:read'), ('department_head','leave:approve'),
    ('department_head','reports:read'),
    -- employee
    ('employee','schedule:read:own'),
    ('employee','attendance:read:own'),
    ('employee','leave:read:own'), ('employee','leave:request'),
    -- viewer
    ('viewer','schedule:read'),
    ('viewer','reports:read')
) AS x(role, permission)
ON CONFLICT (tenant_id, role, permission) DO NOTHING;

COMMIT;
