export const ROLES = {
  SUPER_ADMIN: "super_admin",
  OPERATIONS_HEAD: "operations_head",
  HR_MANAGER: "hr_manager",
  OUTLET_MANAGER: "outlet_manager",
  DEPARTMENT_HEAD: "department_head",
  EMPLOYEE: "employee",
  VIEWER: "viewer",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_HIERARCHY: Record<Role, number> = {
  super_admin: 7,
  operations_head: 6,
  hr_manager: 5,
  outlet_manager: 4,
  department_head: 3,
  employee: 2,
  viewer: 1,
};

// Module-level permissions per role (matches RBAC matrix in PRD §11)
export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  super_admin: ["*"],
  operations_head: [
    "staff:read", "staff:write",
    "outlet:read", "outlet:write",
    "schedule:read", "schedule:write", "schedule:publish",
    "attendance:read", "attendance:write",
    "leave:read", "leave:approve",
    "forecast:read", "forecast:write",
    "allocation:read", "allocation:write",
    "reports:read", "reports:export",
    "notifications:send",
  ],
  hr_manager: [
    "staff:read", "staff:write",
    "outlet:read",
    "schedule:read",
    "attendance:read", "attendance:write",
    "leave:read", "leave:approve",
    "allocation:read", "allocation:write",
    "reports:read", "reports:export",
  ],
  outlet_manager: [
    "staff:read",
    "outlet:read",
    "schedule:read", "schedule:write", "schedule:publish",
    "attendance:read", "attendance:write",
    "leave:read", "leave:approve",
    "forecast:read",
    "allocation:read",
    "reports:read",
    "notifications:send",
  ],
  department_head: [
    "staff:read",
    "schedule:read", "schedule:write",
    "attendance:read",
    "leave:read", "leave:approve",
    "reports:read",
  ],
  employee: [
    "schedule:read:own",
    "attendance:read:own",
    "leave:read:own", "leave:request",
  ],
  viewer: [
    "schedule:read",
    "reports:read",
  ],
};
