"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { apiClient } from "@/lib/api-client";
import {
  LayoutDashboard, Users, Building2, Calendar, Clock,
  CalendarOff, ArrowLeftRight, BarChart3,
  LogOut, Menu, X, ShieldCheck, KeyRound, UserCog, type LucideIcon,
} from "lucide-react";
import type { AuthUser } from "@workforceiq/shared";

// `perm` gates a nav item behind an effective permission from the editable
// role→permission matrix. super_admin always sees everything (see hasPermission).
type NavItem = { href: string; label: string; icon: LucideIcon; badge?: boolean; perm?: string };

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",     label: "Dashboard",     icon: LayoutDashboard },
  { href: "/staff",         label: "Staff",         icon: Users },
  { href: "/outlets",       label: "Outlets",       icon: Building2 },
  { href: "/scheduling",    label: "Scheduling",    icon: Calendar },
  { href: "/attendance",    label: "Attendance",    icon: Clock },
  { href: "/leave",         label: "Leave",         icon: CalendarOff },
  { href: "/allocation",    label: "Allocation",    icon: ArrowLeftRight },
  { href: "/reports",       label: "Reports",       icon: BarChart3 },
  { href: "/accounts",      label: "Accounts",      icon: KeyRound,    perm: "accounts:manage" },
  { href: "/account-types", label: "Account Types", icon: UserCog,     perm: "roles:manage" },
  { href: "/approvals",     label: "Approvals",     icon: ShieldCheck, badge: true, perm: "accounts:manage" },
];

// super_admin (or the "*" wildcard) always passes; otherwise the user must hold
// the specific permission. Older cached sessions may lack `permissions` until the
// /auth/me refresh below runs — the super_admin short-circuit keeps them working.
function hasPermission(user: AuthUser, perm: string): boolean {
  if (user.role === "super_admin") return true;
  const perms = user.permissions ?? [];
  return perms.includes("*") || perms.includes(perm);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router    = useRouter();
  const pathname  = usePathname();
  const { user, accessToken, mustChangePassword, logout, setUser } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (!accessToken) { router.replace("/login"); return; }
    // Accounts flagged for a forced reset can't use the app until they change it.
    if (mustChangePassword) router.replace("/change-password");
  }, [accessToken, mustChangePassword, router]);

  // Pull the caller's current permissions from the server so nav visibility
  // reflects any recent edits on the Account Types page (merge only permissions —
  // the token-derived /auth/me user has no name).
  useEffect(() => {
    if (!accessToken) return;
    apiClient.get("/auth/me")
      .then((r) => {
        const fresh = r.data?.data as AuthUser | undefined;
        const current = useAuthStore.getState().user;
        if (fresh?.permissions && current) setUser({ ...current, permissions: fresh.permissions });
      })
      .catch(() => { /* non-fatal: fall back to cached permissions */ });
  }, [accessToken, setUser]);

  const canManageAccounts = !!user && hasPermission(user, "accounts:manage");

  // Poll pending registrations count for sidebar badge (only for account managers — others get 403)
  const { data: pendingData } = useQuery<{ data: unknown[] }>({
    queryKey: ["pending-registrations"],
    queryFn: () => apiClient.get("/auth/pending-registrations").then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 0,
    enabled: !!accessToken && canManageAccounts,
  });
  const pendingCount = pendingData?.data?.length ?? 0;

  if (!user) return null;

  // Permission-gated areas (Accounts, Account Types, Approvals) are hidden from
  // anyone whose account type doesn't grant the required permission.
  const navItems = NAV_ITEMS.filter((item) => !item.perm || hasPermission(user, item.perm));

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-64" : "w-16"} bg-gray-900 text-white flex flex-col transition-all duration-200 shrink-0`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          {sidebarOpen && (
            <div>
              <h1 className="font-bold text-lg">WorkforceIQ</h1>
              <p className="text-xs text-gray-400">Restaurant Management</p>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 rounded hover:bg-gray-700">
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {navItems.map(({ href, label, icon: Icon, badge }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            const showBadge = badge && pendingCount > 0;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition text-sm ${
                  active ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
              >
                <div className="relative shrink-0">
                  <Icon size={18} />
                  {showBadge && !sidebarOpen && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {pendingCount > 9 ? "9+" : pendingCount}
                    </span>
                  )}
                </div>
                {sidebarOpen && (
                  <>
                    <span className="flex-1">{label}</span>
                    {showBadge && (
                      <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                        {pendingCount}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-700">
          {sidebarOpen && (
            <div className="mb-3">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-xs text-gray-400 truncate">{user.role.replace(/_/g, " ")}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-gray-300 hover:text-white text-sm transition"
          >
            <LogOut size={16} />
            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
