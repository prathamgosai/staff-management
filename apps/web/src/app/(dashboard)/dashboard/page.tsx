"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { isAdminRole } from "@workforceiq/shared";
import {
  Users, Building2, CalendarOff, UserCheck, UserX, ChevronDown,
  Wand2, Shield, Loader2, ChevronRight, RotateCw,
  Pencil, X, Check,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { toast } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { CapacityStaffingSection } from "@/components/dashboard/capacity-staffing-section";
import { DocumentsWidget } from "@/components/dashboard/documents-widget";
import { StaffingAutopilotCard } from "@/components/dashboard/staffing-autopilot-card";
import { OutletDetail } from "@/components/dashboard/outlet-detail";

interface DashboardSummary { totalStaff: number; totalOutlets: number; onShift: number; onLeaveOrOff: number; }
interface TodaySnapshot { staffOnShift: number; pendingLeave: number; pendingApprovals: number; }
interface OutletRow { outlet_id: string; outlet_name: string; outlet_code: string; total_staff: number; full_time: number; part_time: number; departments: number; pending_leaves: number; }
interface StaffRow { id: string; name: string; employee_id: string; position_id: string | null; position_name: string; department_name: string; outlet_name: string; hierarchy_level: number; todays_shift: string | null; }
interface PositionOption { id: string; name: string; level: number; }

const SHIFT_COLORS: Record<string, string> = {
  "Shift A (12:00–21:00)": "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300",
  "Shift B (13:00–22:00)": "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300",
  "Shift C (15:00–00:00)": "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300",
};
const HIERARCHY_LABELS: Record<number, string> = { 1: "Head", 2: "Senior", 3: "Mid", 4: "Staff" };
const HIERARCHY_COLORS: Record<number, string> = {
  1: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300",
  2: "bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300",
  3: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300",
  4: "bg-muted text-muted-foreground",
};

/* ─── Change Designation Modal ────────────────────────────────────────── */
function EditDesignationModal({ staff, onClose }: { staff: StaffRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [positionId, setPositionId] = useState<string | null>(staff.position_id);
  const [err, setErr] = useState<string | null>(null);

  const { data: posRes, isLoading } = useQuery<{ data: PositionOption[] }>({
    queryKey: ["positions"],
    queryFn: () => apiClient.get("/departments/positions").then(r => r.data),
    staleTime: 300_000,
  });
  const positions = posRes?.data ?? [];

  const mutation = useMutation({
    mutationFn: () => apiClient.put(`/staff/${staff.id}`, { positionId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard-hierarchy"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["staff-detail", staff.id] });
      toast.success("Designation updated.");
      onClose();
    },
    onError: (error) => {
      const e = error as { response?: { data?: { message?: string | string[] } } };
      const m = e?.response?.data?.message;
      setErr(Array.isArray(m) ? m.join(", ") : m ?? "Could not save. Please try again.");
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl w-96 max-w-[calc(100vw-2rem)] mx-4 p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-foreground">Change Designation</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted"><X size={16} /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{staff.name} · <span className="font-mono">{staff.employee_id}</span></p>

        {isLoading ? (
          <div className="py-10 flex justify-center"><Loader2 size={20} className="animate-spin text-muted-foreground/60" /></div>
        ) : positions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No positions defined yet</p>
        ) : (
          <div className="space-y-1.5 mb-5 max-h-72 overflow-y-auto pr-1">
            {positions.map(p => (
              <button key={p.id} onClick={() => setPositionId(p.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition flex items-center justify-between gap-2 ${
                  positionId === p.id ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300" : "border-transparent bg-muted text-foreground hover:bg-muted"
                }`}>
                <span>{p.name}</span>
                {positionId === p.id && <Check size={15} className="text-blue-600 shrink-0" />}
              </button>
            ))}
          </div>
        )}

        {err && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2 mb-3">{err}</p>}

        <button onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !positionId || positionId === staff.position_id}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2">
          {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Save Designation
        </button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminRole(user?.role);

  // Outlet Managers (non-admins) are scoped to their own outlet(s): default the
  // filter to their outlet when they have exactly one, so the page opens already
  // drilled into it. Admins / HR start on "All Outlets".
  const [outletFilter, setOutletFilter] = useState(
    () => (!isAdmin && user?.outletIds?.length === 1 ? user.outletIds[0] : ""),
  );
  const [expandedOutlet, setExpandedOutlet] = useState<string | null>(null);
  const [editing, setEditing]               = useState<StaffRow | null>(null);

  const { data: summaryRes, isLoading: sumLoading, isError: sumError, refetch: refetchSummary } =
    useQuery<{ data: DashboardSummary }>({
      queryKey: ["dashboard-summary", outletFilter],
      queryFn: () => apiClient.get("/dashboard/summary", {
        params: { outletId: outletFilter || undefined },
      }).then(r => r.data),
      refetchInterval: 60_000,
    });

  const { data: snapshotRes } = useQuery<{ data: TodaySnapshot }>({
    queryKey: ["dashboard-today"],
    queryFn: () => apiClient.get("/dashboard/today-snapshot").then(r => r.data),
    refetchInterval: 30_000,
  });

  const { data: outletBreakRes, isLoading: breakdownLoading } = useQuery<{ data: OutletRow[] }>({
    queryKey: ["dashboard-outlet-breakdown"],
    queryFn: () => apiClient.get("/dashboard/outlet-breakdown").then(r => r.data),
    staleTime: 60_000,
  });

  const { data: staffRes } = useQuery<{ data: StaffRow[] }>({
    queryKey: ["dashboard-hierarchy", outletFilter],
    queryFn: () => apiClient.get("/dashboard/staff-hierarchy", {
      params: { outletId: outletFilter || undefined },
    }).then(r => r.data),
    staleTime: 30_000,
  });

  const { data: outletsRes } = useQuery({
    queryKey: ["outlets"],
    queryFn: () => apiClient.get("/outlets").then(r => r.data),
  });

  const summary   = summaryRes?.data;
  const snapshot  = snapshotRes?.data;
  const outlets   = outletBreakRes?.data ?? [];
  const staffList = staffRes?.data ?? [];
  const allOutlets = (outletsRes?.data ?? []) as { id: string; name: string }[];
  const selectedOutletName = allOutlets.find(o => o.id === outletFilter)?.name ?? "";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.name?.split(" ")[0] || "there";

  // Group by outlet → department
  const grouped = staffList.reduce<Record<string, Record<string, StaffRow[]>>>((acc, s) => {
    const o = s.outlet_name || "Unknown";
    const d = s.department_name || "General";
    if (!acc[o]) acc[o] = {};
    if (!acc[o][d]) acc[o][d] = [];
    acc[o][d].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {editing && <EditDesignationModal staff={editing} onClose={() => setEditing(null)} />}

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

      {/* Action alerts */}
      {snapshot && (snapshot.pendingLeave > 0 || snapshot.pendingApprovals > 0) && (
        <div className="flex gap-3 flex-wrap">
          {snapshot.pendingLeave > 0 && (
            <Link href="/leave" className="inline-flex items-center gap-2 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-amber-100 transition">
              <CalendarOff size={14} /> {snapshot.pendingLeave} leave request{snapshot.pendingLeave !== 1 ? "s" : ""} pending <ChevronRight size={13} />
            </Link>
          )}
          {snapshot.pendingApprovals > 0 && (
            <Link href="/approvals" className="inline-flex items-center gap-2 bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-red-100 transition">
              <Shield size={14} /> {snapshot.pendingApprovals} account approval{snapshot.pendingApprovals !== 1 ? "s" : ""} waiting <ChevronRight size={13} />
            </Link>
          )}
        </div>
      )}

      {/* Capacity & staffing (visible to allocation:read holders; self-hides otherwise) */}
      <CapacityStaffingSection />

      {/* Document compliance (self-hides without documents:status) */}
      <DocumentsWidget />

      {/* Outlet cards */}
      <div>
        <h2 className="text-sm font-bold text-foreground uppercase tracking-wide mb-3">Restaurants — Staff Breakdown</h2>
        {breakdownLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl border border-border shadow-sm p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-7 w-8" />
                </div>
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        ) : outlets.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border shadow-sm">
            <EmptyState
              icon={Building2}
              title="No outlets yet"
              description="Add your first restaurant to see its staff breakdown here."
              action={
                <Link href="/outlets" className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold px-4 py-2 rounded-xl transition">
                  <Building2 size={14} /> Go to Outlets
                </Link>
              }
            />
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {outlets.map(o => (
            <div key={o.outlet_id} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-4 py-3.5 flex items-center justify-between">
                <div>
                  <p className="font-bold text-foreground text-sm">{o.outlet_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{o.outlet_code}</p>
                </div>
                <span className="text-2xl font-black text-foreground">{o.total_staff}</span>
              </div>
              <div className="px-4 pb-3 flex items-center justify-between border-t border-border pt-2.5">
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span><b className="text-foreground">{o.full_time}</b> FT</span>
                  <span><b className="text-foreground">{o.part_time}</b> PT</span>
                  {Number(o.pending_leaves) > 0 && <span className="text-amber-600 font-semibold">{o.pending_leaves} leave</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>

      {/* Staff directory */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-bold text-foreground">Staff Directory with Hierarchy</h2>
            <p className="text-xs text-muted-foreground">
              {staffList.length} active staff{outletFilter && selectedOutletName ? ` · ${selectedOutletName}` : ""}
            </p>
          </div>
          {outletFilter && (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Building2 size={12} /> Filtered by the outlet selector above
            </span>
          )}
        </div>

        {Object.entries(grouped).length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">No staff found</div>
        ) : (
          Object.entries(grouped).map(([outletName, depts]) => (
            <div key={outletName}>
              <button
                onClick={() => setExpandedOutlet(expandedOutlet === outletName ? null : outletName)}
                className="w-full flex items-center gap-3 px-5 py-3 bg-muted hover:bg-muted transition border-b border-border text-left">
                <Building2 size={14} className="text-muted-foreground shrink-0" />
                <span className="font-bold text-foreground flex-1 text-sm">{outletName}</span>
                <span className="text-xs text-muted-foreground mr-2">{Object.values(depts).flat().length} staff</span>
                <ChevronDown size={14} className={`text-muted-foreground transition-transform ${expandedOutlet === outletName ? "rotate-180" : ""}`} />
              </button>

              {(expandedOutlet === null || expandedOutlet === outletName) && Object.entries(depts).map(([deptName, members]) => (
                <div key={deptName}>
                  <div className="px-6 py-1.5 bg-card border-b border-border flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">{deptName}</span>
                    <span className="text-xs text-muted-foreground">({members.length})</span>
                  </div>
                  {members.map(s => (
                    <div key={s.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-border hover:bg-muted/60 transition">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                        {s.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{s.employee_id}</p>
                      </div>
                      {isAdmin ? (
                        <button onClick={() => setEditing(s)} title="Change designation"
                          className="text-xs text-muted-foreground hidden sm:block min-w-[120px] text-left hover:text-blue-600 transition truncate">
                          {s.position_name}
                        </button>
                      ) : (
                        <p className="text-xs text-muted-foreground hidden sm:block min-w-[120px] truncate">{s.position_name}</p>
                      )}
                      {isAdmin ? (
                        <button onClick={() => setEditing(s)} title="Change designation"
                          className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 transition cursor-pointer hover:ring-2 hover:ring-blue-300 hover:ring-offset-1 ${HIERARCHY_COLORS[s.hierarchy_level]}`}>
                          {HIERARCHY_LABELS[s.hierarchy_level]}
                        </button>
                      ) : (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${HIERARCHY_COLORS[s.hierarchy_level]}`}>
                          {HIERARCHY_LABELS[s.hierarchy_level]}
                        </span>
                      )}
                      <div className="hidden md:block min-w-[150px] text-right">
                        {s.todays_shift ? (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SHIFT_COLORS[s.todays_shift] ?? "bg-muted text-muted-foreground"}`}>
                            {s.todays_shift}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">No shift today</span>
                        )}
                      </div>
                      {isAdmin && (
                        <button onClick={() => setEditing(s)} title="Change designation"
                          className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition shrink-0">
                          <Pencil size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* AI staffing autopilot — prediction-driven cross-outlet transfer recommendations.
          Its per-outlet table carries predicted PAX for every outlet, which is why the
          single-outlet PaxPredictionCard was removed as a subset of this. */}
      <StaffingAutopilotCard />
    </div>
  );
}
