import {
  LayoutDashboard, Users, Building2, Calendar, Clock, MapPin,
  CalendarOff, ArrowLeftRight, BarChart3, Calculator, Upload,
  ShieldCheck, KeyRound, UserCog, Bell, Settings, FileText, History, type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permission required to see this item (via hasPermission). Absent = always visible. */
  perm?: string;
  /**
   * Only for accounts linked to a staff record. Not a permission — self-service pages act on
   * "your own staff row", so an admin login with no staff profile has nothing to act on and
   * would only ever see an explanatory dead end.
   */
  staffOnly?: boolean;
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
      // Self-service: staff punch here from their own device. No perm gate — the endpoint
      // resolves the caller's own staff row — but hidden from logins with no staff record
      // (e.g. System Admin), who have no-one to clock in.
      { href: "/punch", label: "Clock in / out", icon: MapPin, staffOnly: true },
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
      { href: "/documents", label: "Documents", icon: FileText, perm: "documents:status" },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/predictions", label: "Staff predictor", icon: Calculator, perm: "predictions:run" },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/accounts", label: "Accounts", icon: KeyRound, perm: "accounts:manage" },
      { href: "/account-types", label: "Account Types", icon: UserCog, perm: "roles:manage" },
      { href: "/approvals", label: "Approvals", icon: ShieldCheck, perm: "accounts:manage", badge: true },
      { href: "/audit", label: "Audit log", icon: History, perm: "accounts:manage" },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/settings/document-types", label: "Document types", icon: FileText, perm: "staff:documents" },
      { href: "/planning/pax-import", label: "Import pax history", icon: Upload, perm: "outlet:write" },
      { href: "/settings/notifications", label: "Notification settings", icon: Settings },
    ],
  },
];

/** Flattened items, for the command palette and page-title lookups. */
export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
