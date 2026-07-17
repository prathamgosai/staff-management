"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import { isAdminRole } from "@workforceiq/shared";
import {
  Users, Building2, UserCheck, UserX, ChevronDown,
  Wand2, ChevronRight, RotateCw, X,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { OutletDetail } from "@/components/dashboard/outlet-detail";

interface DashboardSummary { totalStaff: number; totalOutlets: number; onShift: number; onLeaveOrOff: number; }

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminRole(user?.role);

  // Single source of truth, shared with the top-bar OutletSwitcher: either
  // control re-scopes the page, and the two never disagree. Store holds null for
  // "all outlets"; the <select> needs "" for its placeholder option.
  const selectedOutletId = useUiStore((s) => s.selectedOutletId);
  const setSelectedOutletId = useUiStore((s) => s.setSelectedOutletId);
  const outletFilter = selectedOutletId ?? "";
  const setOutletFilter = (id: string) => setSelectedOutletId(id || null);

  // Outlet Managers (non-admins) are scoped to their own outlet(s): default the
  // filter to their outlet when they have exactly one, so the page opens already
  // drilled into it. Admins / HR start on "All Outlets".
  const soleOutletId = !isAdmin && user?.outletIds?.length === 1 ? user.outletIds[0] : null;
  useEffect(() => {
    if (soleOutletId) setSelectedOutletId(soleOutletId);
  }, [soleOutletId, setSelectedOutletId]);

  const { data: summaryRes, isLoading: sumLoading, isError: sumError, refetch: refetchSummary } =
    useQuery<{ data: DashboardSummary }>({
      queryKey: ["dashboard-summary", outletFilter],
      queryFn: () => apiClient.get("/dashboard/summary", {
        params: { outletId: outletFilter || undefined },
      }).then(r => r.data),
      refetchInterval: 60_000,
    });

  const { data: outletsRes } = useQuery({
    queryKey: ["outlets"],
    queryFn: () => apiClient.get("/outlets").then(r => r.data),
  });

  const summary = summaryRes?.data;
  const allOutlets = (outletsRes?.data ?? []) as { id: string; name: string }[];
  const selectedOutletName = allOutlets.find(o => o.id === outletFilter)?.name ?? "";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.name?.split(" ")[0] || "there";

  return (
    <div className="space-y-6">
      {/* Header — greeting + today's date */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Operations Dashboard</p>
          <h1 className="text-2xl font-bold text-foreground">{greeting}, {firstName}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
        </div>
        <Link href="/scheduling"
          className="inline-flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-semibold transition">
          <Wand2 size={14} /> Schedule Builder
        </Link>
      </div>

      {/* KPI load error — subtle banner with retry, page keeps rendering */}
      {sumError && (
        <div className="flex items-center justify-between gap-3 bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 text-sm px-4 py-2.5 rounded-xl">
          <span>Couldn&apos;t load the latest KPI numbers.</span>
          <button onClick={() => refetchSummary()} className="inline-flex items-center gap-1.5 font-semibold hover:underline shrink-0">
            <RotateCw size={13} /> Retry
          </button>
        </div>
      )}

      {/* KPI row — 4 on desktop, 2×2 on tablet, stacked on mobile */}
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Staff",    value: summary?.totalStaff,   icon: Users,     tint: "bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400",         accent: "bg-blue-500",    sub: outletFilter ? "at this outlet" : "active, all outlets", href: "/staff" },
          { label: "Total Outlets",  value: summary?.totalOutlets, icon: Building2, tint: "bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400", accent: "bg-violet-500",  sub: outletFilter ? "selected" : "all active",               href: "/outlets" },
          { label: "On Shift",       value: summary?.onShift,      icon: UserCheck, tint: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", accent: "bg-emerald-500", sub: "scheduled today",                                   href: "/scheduling" },
          { label: "On Leave / Off", value: summary?.onLeaveOrOff, icon: UserX,     tint: "bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400",     accent: "bg-amber-500",   sub: "leave or weekly off",                                  href: "/leave" },
        ].map(({ label, value, icon: Icon, tint, accent, sub, href }) => (
          <Link
            key={label}
            href={href}
            className="group relative bg-card rounded-2xl border border-border p-4 sm:p-5 flex items-center gap-4 shadow-sm transition hover:shadow-md hover:-translate-y-0.5 overflow-hidden"
          >
            <div className={`rounded-full p-3 shrink-0 ${tint}`}><Icon size={20} /></div>
            <div className="min-w-0">
              {sumLoading ? (
                <Skeleton className="h-8 w-12 mb-1" />
              ) : (
                <p className="text-3xl font-black text-foreground leading-tight">{value ?? "—"}</p>
              )}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                {label}
                <ChevronRight size={12} className="opacity-0 -translate-x-1 transition group-hover:opacity-100 group-hover:translate-x-0" />
              </p>
              <p className="text-[11px] text-muted-foreground">{sub}</p>
            </div>
            <span className={`absolute inset-x-0 bottom-0 h-1 ${accent}`} />
          </Link>
        ))}
      </div>

      {/* Outlet filter — re-scopes all 4 KPI cards and opens the drill-down below */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="w-full sm:max-w-xs">
          <label htmlFor="outlet-filter" className="block text-xs font-semibold text-muted-foreground mb-1.5">Filter by Outlet</label>
          <div className="relative">
            <select
              id="outlet-filter"
              value={outletFilter}
              onChange={e => setOutletFilter(e.target.value)}
              className="w-full text-sm border border-border rounded-xl pl-3 pr-8 py-2 outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-card"
            >
              <option value="">All Outlets</option>
              {allOutlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        {outletFilter && (
          <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 text-xs font-semibold px-3 py-2 rounded-xl h-fit">
            Showing: {selectedOutletName || "outlet"}
            <button
              onClick={() => setOutletFilter("")}
              className="hover:bg-blue-100 dark:hover:bg-blue-500/25 rounded-md p-0.5 transition"
              title="Clear filter"
              aria-label="Clear outlet filter"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Outlet drill-down — staff-today table, only when a specific outlet is picked */}
      {outletFilter && <OutletDetail outletId={outletFilter} />}
    </div>
  );
}
