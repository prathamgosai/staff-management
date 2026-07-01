"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { isAdminRole } from "@workforceiq/shared";
import {
  Users, Building2, CalendarOff, Clock, ChevronDown,
  Wand2, TrendingUp, Shield, Loader2, ChevronRight, CheckCircle2,
  Pencil, X, Check,
} from "lucide-react";
import { format, startOfWeek } from "date-fns";
import Link from "next/link";

interface OverviewData { totalOutlets: number; activeStaff: number; staffOnLeaveToday: number; presentToday: number; }
interface TodaySnapshot { staffOnShift: number; pendingLeave: number; pendingApprovals: number; }
interface OutletRow { outlet_id: string; outlet_name: string; outlet_code: string; total_staff: number; full_time: number; part_time: number; departments: number; pending_leaves: number; }
interface StaffRow { id: string; name: string; employee_id: string; position_id: string | null; position_name: string; department_name: string; outlet_name: string; hierarchy_level: number; todays_shift: string | null; }
interface PositionOption { id: string; name: string; level: number; }

const SHIFT_COLORS: Record<string, string> = {
  "Shift A (12:00–21:00)": "bg-blue-100 text-blue-700",
  "Shift B (13:00–22:00)": "bg-purple-100 text-purple-700",
  "Shift C (15:00–00:00)": "bg-amber-100 text-amber-700",
};
const HIERARCHY_LABELS: Record<number, string> = { 1: "Head", 2: "Senior", 3: "Mid", 4: "Staff" };
const HIERARCHY_COLORS: Record<number, string> = {
  1: "bg-red-100 text-red-700",
  2: "bg-orange-100 text-orange-700",
  3: "bg-blue-100 text-blue-700",
  4: "bg-gray-100 text-gray-600",
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
      onClose();
    },
    onError: (error) => {
      const e = error as { response?: { data?: { message?: string | string[] } } };
      const m = e?.response?.data?.message;
      setErr(Array.isArray(m) ? m.join(", ") : m ?? "Could not save. Please try again.");
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-96 max-w-[calc(100vw-2rem)] mx-4 p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-gray-900">Change Designation</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={16} /></button>
        </div>
        <p className="text-xs text-gray-400 mb-4">{staff.name} · <span className="font-mono">{staff.employee_id}</span></p>

        {isLoading ? (
          <div className="py-10 flex justify-center"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
        ) : positions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No positions defined yet</p>
        ) : (
          <div className="space-y-1.5 mb-5 max-h-72 overflow-y-auto pr-1">
            {positions.map(p => (
              <button key={p.id} onClick={() => setPositionId(p.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition flex items-center justify-between gap-2 ${
                  positionId === p.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-transparent bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}>
                <span>{p.name}</span>
                {positionId === p.id && <Check size={15} className="text-blue-600 shrink-0" />}
              </button>
            ))}
          </div>
        )}

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</p>}

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
  const [outletFilter, setOutletFilter]     = useState("");
  const [expandedOutlet, setExpandedOutlet] = useState<string | null>(null);
  const [editing, setEditing]               = useState<StaffRow | null>(null);
  const isAdmin = useAuthStore((s) => isAdminRole(s.user?.role));

  const { data: overviewRes, isLoading: ovLoading } = useQuery<{ data: OverviewData }>({
    queryKey: ["dashboard-overview"],
    queryFn: () => apiClient.get("/dashboard/overview").then(r => r.data),
    refetchInterval: 60_000,
  });

  const { data: snapshotRes } = useQuery<{ data: TodaySnapshot }>({
    queryKey: ["dashboard-today"],
    queryFn: () => apiClient.get("/dashboard/today-snapshot").then(r => r.data),
    refetchInterval: 30_000,
  });

  const { data: outletBreakRes } = useQuery<{ data: OutletRow[] }>({
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

  const overview  = overviewRes?.data;
  const snapshot  = snapshotRes?.data;
  const outlets   = outletBreakRes?.data ?? [];
  const staffList = staffRes?.data ?? [];
  const allOutlets = (outletsRes?.data ?? []) as { id: string; name: string }[];

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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operations Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{format(new Date(), "EEEE, d MMMM yyyy")} · Real-time workforce snapshot</p>
        </div>
        <Link href="/scheduling"
          className="inline-flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-semibold transition">
          <Wand2 size={14} /> Schedule Builder
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Outlets",    value: overview?.totalOutlets,       icon: Building2,  color: "bg-blue-500",    sub: "all operational" },
          { label: "Total Staff",       value: overview?.activeStaff,        icon: Users,      color: "bg-emerald-500", sub: "across all outlets" },
          { label: "On Leave Today",    value: overview?.staffOnLeaveToday,  icon: CalendarOff,color: "bg-amber-500",   sub: "approved leaves" },
          { label: "On Shift Today",    value: snapshot?.staffOnShift,       icon: Clock,      color: "bg-purple-500",  sub: "scheduled today" },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 shadow-sm">
            <div className={`${color} text-white rounded-xl p-3 shrink-0`}><Icon size={20} /></div>
            <div>
              <p className="text-2xl font-black text-gray-900">
                {ovLoading ? <Loader2 size={18} className="animate-spin text-gray-300 inline" /> : (value ?? "—")}
              </p>
              <p className="text-xs font-semibold text-gray-700">{label}</p>
              <p className="text-xs text-gray-400">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Action alerts */}
      {snapshot && (snapshot.pendingLeave > 0 || snapshot.pendingApprovals > 0) && (
        <div className="flex gap-3 flex-wrap">
          {snapshot.pendingLeave > 0 && (
            <Link href="/leave" className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-amber-100 transition">
              <CalendarOff size={14} /> {snapshot.pendingLeave} leave request{snapshot.pendingLeave !== 1 ? "s" : ""} pending <ChevronRight size={13} />
            </Link>
          )}
          {snapshot.pendingApprovals > 0 && (
            <Link href="/approvals" className="inline-flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-red-100 transition">
              <Shield size={14} /> {snapshot.pendingApprovals} account approval{snapshot.pendingApprovals !== 1 ? "s" : ""} waiting <ChevronRight size={13} />
            </Link>
          )}
        </div>
      )}

      {/* Shift legend */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl px-5 py-4 text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Weekly Auto-Rotation Shifts — All Restaurants</p>
        <div className="flex gap-6 flex-wrap">
          {[
            { name: "Shift A", time: "12:00 – 21:00 (9 hrs)", dot: "bg-blue-400" },
            { name: "Shift B", time: "13:00 – 22:00 (9 hrs)", dot: "bg-purple-400" },
            { name: "Shift C", time: "15:00 – 00:00 (9 hrs)", dot: "bg-amber-400" },
          ].map(s => (
            <div key={s.name} className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
              <span className="font-bold text-sm">{s.name}</span>
              <span className="text-slate-400 text-sm">{s.time}</span>
            </div>
          ))}
          <span className="text-slate-500 text-xs self-center ml-2">Groups rotate A→B→C every Monday automatically</span>
        </div>
      </div>

      {/* Outlet cards */}
      <div>
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Restaurants — Staff Breakdown</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {outlets.map(o => (
            <div key={o.outlet_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3.5 flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-900 text-sm">{o.outlet_name}</p>
                  <p className="text-xs text-gray-400 font-mono">{o.outlet_code}</p>
                </div>
                <span className="text-2xl font-black text-gray-800">{o.total_staff}</span>
              </div>
              <div className="px-4 pb-3 flex items-center justify-between border-t border-gray-50 pt-2.5">
                <div className="flex gap-3 text-xs text-gray-500">
                  <span><b className="text-gray-700">{o.full_time}</b> FT</span>
                  <span><b className="text-gray-700">{o.part_time}</b> PT</span>
                  {Number(o.pending_leaves) > 0 && <span className="text-amber-600 font-semibold">{o.pending_leaves} leave</span>}
                </div>
                <div className="flex items-center gap-1 text-xs text-emerald-600 font-semibold shrink-0">
                  <CheckCircle2 size={12} /> Auto-scheduled
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Staff directory */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-bold text-gray-900">Staff Directory with Hierarchy</h2>
            <p className="text-xs text-gray-400">{staffList.length} active staff</p>
          </div>
          <div className="relative">
            <select value={outletFilter} onChange={e => setOutletFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl pl-3 pr-8 py-2 outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white">
              <option value="">All Restaurants</option>
              {allOutlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {Object.entries(grouped).length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No staff found</div>
        ) : (
          Object.entries(grouped).map(([outletName, depts]) => (
            <div key={outletName}>
              <button
                onClick={() => setExpandedOutlet(expandedOutlet === outletName ? null : outletName)}
                className="w-full flex items-center gap-3 px-5 py-3 bg-gray-50 hover:bg-gray-100 transition border-b border-gray-100 text-left">
                <Building2 size={14} className="text-gray-400 shrink-0" />
                <span className="font-bold text-gray-800 flex-1 text-sm">{outletName}</span>
                <span className="text-xs text-gray-400 mr-2">{Object.values(depts).flat().length} staff</span>
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${expandedOutlet === outletName ? "rotate-180" : ""}`} />
              </button>

              {(expandedOutlet === null || expandedOutlet === outletName) && Object.entries(depts).map(([deptName, members]) => (
                <div key={deptName}>
                  <div className="px-6 py-1.5 bg-white border-b border-gray-50 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">{deptName}</span>
                    <span className="text-xs text-gray-400">({members.length})</span>
                  </div>
                  {members.map(s => (
                    <div key={s.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-50 hover:bg-gray-50/60 transition">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                        {s.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                        <p className="text-xs text-gray-400 font-mono">{s.employee_id}</p>
                      </div>
                      {isAdmin ? (
                        <button onClick={() => setEditing(s)} title="Change designation"
                          className="text-xs text-gray-500 hidden sm:block min-w-[120px] text-left hover:text-blue-600 transition truncate">
                          {s.position_name}
                        </button>
                      ) : (
                        <p className="text-xs text-gray-500 hidden sm:block min-w-[120px] truncate">{s.position_name}</p>
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
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SHIFT_COLORS[s.todays_shift] ?? "bg-gray-100 text-gray-600"}`}>
                            {s.todays_shift}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">No shift today</span>
                        )}
                      </div>
                      {isAdmin && (
                        <button onClick={() => setEditing(s)} title="Change designation"
                          className="p-1.5 rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition shrink-0">
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

      {/* PAX prediction placeholder */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">PAX Prediction & Staffing Requirements</h3>
            <p className="text-xs text-gray-400 mt-0.5">AI-powered staff requirement forecasting based on table count & peak hours</p>
          </div>
          <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-3 py-1 rounded-full">Coming soon</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {["Table Count", "Peak Hours", "Predicted PAX"].map(label => (
            <div key={label} className="bg-gray-50 rounded-xl p-4 text-center">
              <TrendingUp size={20} className="text-gray-300 mx-auto mb-2" />
              <p className="text-xs font-semibold text-gray-400">{label}</p>
              <p className="text-lg font-bold text-gray-300 mt-1">—</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
