import {
  LayoutDashboard, Users, Building2, Calendar, Clock,
  CalendarOff, ArrowLeftRight, BarChart3,
  ShieldCheck, KeyRound, UserCog, Bell, type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permission required to see this item (via hasPermission). Absent = always visible. */
  perm?: string;
  /** Shows the pending-approvals count badge. */
  badge?: boolean;
};

export type NavGroup = {
  /** Section heading; null renders the items with no heading. */
  label: string | null;
  items: NavItem[];
};

/**
 * Grouped navigation. All existing routes are preserved — only reorganised into
 * labelled sections. Admin items are permission-gated (accounts:manage / roles:manage).
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/scheduling", label: "Scheduling", icon: Calendar },
      { href: "/attendance", label: "Attendance", icon: Clock },
      { href: "/leave", label: "Leave", icon: CalendarOff },
      { href: "/allocation", label: "Allocation", icon: ArrowLeftRight },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/staff", label: "Staff", icon: Users },
      { href: "/outlets", label: "Outlets", icon: Building2 },
    ],
  },
  {
    label: "Insights",
    items: [{ href: "/reports", label: "Reports", icon: BarChart3 }],
  },
  {
    label: "Administration",
    items: [
      { href: "/accounts", label: "Accounts", icon: KeyRound, perm: "accounts:manage" },
      { href: "/account-types", label: "Account Types", icon: UserCog, perm: "roles:manage" },
      { href: "/approvals", label: "Approvals", icon: ShieldCheck, perm: "accounts:manage", badge: true },
    ],
  },
];

/** Flattened items, for the command palette and page-title lookups. */
export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
