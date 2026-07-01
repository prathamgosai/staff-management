export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  HR: "hr",
  HEAD_OF_HOUSE: "head_of_house",
  CHEF: "chef",
  EMPLOYEE: "employee",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_HIERARCHY: Record<Role, number> = {
  super_admin: 6,
  admin: 5,
  hr: 4,
  head_of_house: 3,
  chef: 2,
  employee: 1,
};

// Roles that get full administrator control, on par with super_admin, across
// every admin-gated screen and endpoint. Admin and HR are admin peers.
// (super_admin itself stays special — e.g. its permissions can't be edited.)
export const ADMIN_ROLES: Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR];
export const isAdminRole = (role?: string | null): boolean =>
  !!role && (ADMIN_ROLES as string[]).includes(role);

// Roles a Staff Account can be reassigned to from the Staff Accounts page.
// super_admin is intentionally excluded — it can never be handed out here.
export const ASSIGNABLE_ROLES: Role[] = [
  ROLES.ADMIN, ROLES.HR, ROLES.HEAD_OF_HOUSE, ROLES.CHEF, ROLES.EMPLOYEE,
];

// Who may change another account's role: super_admin and HR only (not Admin).
export const ROLE_ASSIGNER_ROLES: Role[] = [ROLES.SUPER_ADMIN, ROLES.HR];
export const canAssignRoles = (role?: string | null): boolean =>
  !!role && (ROLE_ASSIGNER_ROLES as string[]).includes(role);

// Human-friendly metadata for each account type, shown on the management page.
export interface RoleMeta {
  label: string;
  description: string;
  hierarchy: number;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  super_admin:   { label: "Super Admin",   description: "Full, unrestricted access to every part of the system. Cannot be edited.", hierarchy: ROLE_HIERARCHY.super_admin },
  admin:         { label: "Admin",         description: "Administrator with full access across the whole system.",                  hierarchy: ROLE_HIERARCHY.admin },
  hr:            { label: "HR",            description: "Human resources — manages staff, attendance and leave. Full access.",      hierarchy: ROLE_HIERARCHY.hr },
  head_of_house: { label: "Head of House", description: "Runs front-of-house for their outlet: rosters, attendance, leave.",         hierarchy: ROLE_HIERARCHY.head_of_house },
  chef:          { label: "Chef",          description: "Leads the kitchen: scheduling, attendance and leave for kitchen staff.",    hierarchy: ROLE_HIERARCHY.chef },
  employee:      { label: "Employee",      description: "A staff member: sees their own schedule, attendance and leave.",            hierarchy: ROLE_HIERARCHY.employee },
};

// Catalogue of every permission the app understands, grouped by module. This is
// the single source of truth the Account Types page renders as toggles. Keys use
// the "<module>:<action>[:own]" convention already used by ROLE_PERMISSIONS.
export interface PermissionDef {
  key: string;
  label: string;
  description?: string;
}
export interface PermissionModule {
  key: string;
  label: string;
  permissions: PermissionDef[];
}

export const PERMISSION_CATALOG: PermissionModule[] = [
  {
    key: "staff", label: "Staff",
    permissions: [
      { key: "staff:read",  label: "View staff",        description: "See staff profiles and directory." },
      { key: "staff:write", label: "Add / edit staff",  description: "Create, update and deactivate staff." },
    ],
  },
  {
    key: "outlet", label: "Outlets",
    permissions: [
      { key: "outlet:read",  label: "View outlets",       description: "See outlet list and details." },
      { key: "outlet:write", label: "Add / edit outlets", description: "Create and update outlets." },
    ],
  },
  {
    key: "schedule", label: "Scheduling",
    permissions: [
      { key: "schedule:read",     label: "View schedules",           description: "See the full roster for their outlets." },
      { key: "schedule:write",    label: "Create / edit schedules",  description: "Generate rosters and edit shift times." },
      { key: "schedule:publish",  label: "Publish schedules",        description: "Publish a draft roster to staff." },
      { key: "schedule:read:own", label: "View own schedule",        description: "See only their own shifts." },
    ],
  },
  {
    key: "attendance", label: "Attendance",
    permissions: [
      { key: "attendance:read",     label: "View attendance",              description: "See attendance for their outlets." },
      { key: "attendance:write",    label: "Edit attendance / corrections", description: "Add manual entries and approve corrections." },
      { key: "attendance:read:own", label: "View own attendance",          description: "See only their own attendance." },
    ],
  },
  {
    key: "leave", label: "Leave",
    permissions: [
      { key: "leave:read",     label: "View leave requests",   description: "See leave requests for their outlets." },
      { key: "leave:approve",  label: "Approve / reject leave", description: "Review and decide on leave requests." },
      { key: "leave:request",  label: "Request leave",         description: "Submit their own leave requests." },
      { key: "leave:read:own", label: "View own leave",        description: "See only their own leave." },
    ],
  },
  {
    key: "forecast", label: "Forecasting",
    permissions: [
      { key: "forecast:read",  label: "View forecasts",     description: "See demand forecasts and recommendations." },
      { key: "forecast:write", label: "Generate forecasts", description: "Run and update forecasts." },
    ],
  },
  {
    key: "allocation", label: "Allocation",
    permissions: [
      { key: "allocation:read",  label: "View transfers",            description: "See staff transfers and suggestions." },
      { key: "allocation:write", label: "Create / approve transfers", description: "Request and review staff transfers." },
    ],
  },
  {
    key: "reports", label: "Reports",
    permissions: [
      { key: "reports:read",   label: "View reports",   description: "Open dashboards and reports." },
      { key: "reports:export", label: "Export reports", description: "Download report data." },
    ],
  },
  {
    key: "notifications", label: "Notifications",
    permissions: [
      { key: "notifications:send", label: "Send notifications", description: "Send WhatsApp / email notifications to staff." },
    ],
  },
  {
    key: "accounts", label: "Accounts & Access",
    permissions: [
      { key: "accounts:manage", label: "Manage staff accounts", description: "View login accounts, reset passwords, approve registrations." },
      { key: "roles:manage",    label: "Manage account types", description: "Edit what each account type is allowed to do." },
    ],
  },
];

// Flat list of every valid permission key — used to validate edits server-side.
export const ALL_PERMISSIONS: string[] = PERMISSION_CATALOG.flatMap((m) => m.permissions.map((p) => p.key));

// Module-level permissions per role (matches RBAC matrix in PRD §11).
// Seeds the editable role_permissions table; also the fallback when it is empty.
export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  super_admin: ["*"],
  // Admin & HR are full-access admin peers of super_admin.
  admin: [...ALL_PERMISSIONS],
  hr: [...ALL_PERMISSIONS],
  head_of_house: [
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
  chef: [
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
};
