"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { Gauge, Users, X, ShieldAlert, ChevronRight, Loader2 } from "lucide-react";
import { TransferRecommendationsCard } from "@/components/staffing/transfer-recommendations-card";

const StaffingCharts = dynamic(() => import("@/components/staffing/staffing-charts"), {
  ssr: false, loading: () => <div className="w-full h-64 bg-muted rounded-xl animate-pulse" />,
});

/* ─── status meta (4-colour + unconfigured) ───────────────────────────────── */
type Status = "green" | "yellow" | "red" | "blue" | "unconfigured";
const STATUS: Record<Status, { label: string; dot: string; pill: string; ring: string }> = {
  green:        { label: "Perfect",      dot: "bg-success",     pill: "bg-success/15 text-success",         ring: "border-success/30" },
  yellow:       { label: "Minor short",  dot: "bg-warning",     pill: "bg-warning/15 text-warning",         ring: "border-warning/30" },
  red:          { label: "Critical",     dot: "bg-destructive", pill: "bg-destructive/15 text-destructive", ring: "border-destructive/40" },
  blue:         { label: "Excess",       dot: "bg-info",        pill: "bg-info/15 text-info",               ring: "border-info/30" },
  unconfigured: { label: "Not set up",   dot: "bg-muted-foreground/40", pill: "bg-muted text-muted-foreground", ring: "border-border" },
};

interface CompanyResp {
  date: string;
  kpis: Record<string, number | null>;
  statusBreakdown: Record<Status, number>;
  outlets: { outletId: string; name: string; status: Status; effectivePax: number | null; required: number; current: number; excess: number; shortage: number }[];
}
interface OutletResp {
  outletId: string; name: string; status: Status; effectivePax: number | null;
  totals: Record<string, number>;
  roles: { positionId: string; positionName: string; required: number; current: number; available: number; present: number; onLeave: number; shortage: number; excess: number; status: Status }[];
}

const KPI_LAYOUT: { key: string; label: string }[] = [
  { key: "totalEmployees", label: "Total employees" },
  { key: "activeEmployees", label: "Active" },
  { key: "onLeaveToday", label: "On leave today" },
  { key: "presentToday", label: "Present today" },
  { key: "transferredToday", label: "Transferred today" },
  { key: "inNoticePeriod", label: "In notice period" },
  { key: "requiredStaff", label: "Required (company)" },
  { key: "currentStaff", label: "Current (company)" },
  { key: "excess", label: "Excess" },
  { key: "shortage", label: "Shortage" },
  { key: "vacantPositions", label: "Vacant positions" },
  { key: "restaurantsOperating", label: "Restaurants operating" },
  { key: "avgStaffUtilizationPct", label: "Avg utilization %" },
  { key: "avgEmployeesPerRestaurant", label: "Avg staff / restaurant" },
  { key: "avgRequiredStaff", label: "Avg required" },
  { key: "avgExcessStaff", label: "Avg excess" },
];

export default function StaffingDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const allowed = hasPermission(user, "allocation:read");
  const [drill, setDrill] = useState<string | null>(null);

  const company = useQuery<{ data: CompanyResp }>({
    queryKey: ["company-staffing"],
    queryFn: () => apiClient.get("/dashboard/company-staffing").then((r) => r.data),
    staleTime: 60_000, enabled: allowed,
  });

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md text-center py-20">
        <ShieldAlert className="mx-auto text-muted-foreground mb-3" size={28} />
        <p className="text-sm text-muted-foreground">You don’t have access to staffing dashboards.</p>
      </div>
    );
  }

  const d = company.data?.data;
  const outlets = d?.outlets ?? [];
  const chartData = outlets.filter((o) => o.status !== "unconfigured").map((o) => ({ name: o.name, required: o.required, current: o.current, excess: o.excess, shortage: o.shortage }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Gauge size={18} /></div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Company staffing</h1>
          <p className="text-sm text-muted-foreground">Real-time required vs available across every restaurant{d ? ` · ${d.date}` : ""}.</p>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {KPI_LAYOUT.map((k) => {
          const v = d?.kpis[k.key];
          return (
            <div key={k.key} className="bg-card rounded-2xl border border-border shadow-sm p-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{k.label}</p>
              {company.isLoading ? <div className="h-7 w-12 bg-muted rounded animate-pulse mt-1" />
                : <p className="text-2xl font-black text-foreground mt-0.5">{v === null || v === undefined ? "—" : v}{k.key === "avgStaffUtilizationPct" && v != null ? "%" : ""}</p>}
            </div>
          );
        })}
      </div>

      {/* Charts */}
      {chartData.length > 0 && (
        <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
          <StaffingCharts data={chartData} />
        </div>
      )}

      {/* Intelligent transfer recommendations (Feature 6) */}
      <TransferRecommendationsCard />

      {/* Restaurant cards */}
      <div>
        <h2 className="text-sm font-bold text-foreground mb-3">Restaurants</h2>
        {company.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-40 bg-muted rounded-2xl animate-pulse" />)}</div>
        ) : outlets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No restaurants in scope.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {outlets.map((o) => {
              const st = STATUS[o.status];
              const delta = o.excess - o.shortage;
              return (
                <button key={o.outletId} onClick={() => setDrill(o.outletId)}
                  className={`text-left bg-card rounded-2xl border ${st.ring} shadow-sm p-5 hover:shadow-md transition group`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-foreground truncate">{o.name}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${st.pill}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
                    </span>
                  </div>
                  {o.status === "unconfigured" ? (
                    <p className="text-sm text-muted-foreground">Set capacity & ratios to model this outlet.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <Metric label="Pax" value={o.effectivePax ?? "—"} />
                      <Metric label="Required" value={o.required} />
                      <Metric label="Current" value={o.current} />
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <span className={`text-sm font-bold ${delta > 0 ? "text-info" : delta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {delta === 0 ? "Balanced" : delta > 0 ? `+${delta} excess` : `${-delta} short`}
                    </span>
                    <ChevronRight size={15} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {drill && <OutletDrill outletId={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-lg font-black text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}

/* ─── per-outlet role drill-down ──────────────────────────────────────────── */
function OutletDrill({ outletId, onClose }: { outletId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ data: OutletResp }>({
    queryKey: ["staffing-outlet", outletId],
    queryFn: () => apiClient.get(`/staffing/requirements/${outletId}`).then((r) => r.data),
  });
  const o = data?.data;
  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card w-full max-w-md h-full shadow-2xl p-5 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground flex items-center gap-2"><Users size={16} /> {o?.name ?? "Outlet"}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted"><X size={16} /></button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : !o ? (
          <p className="text-sm text-muted-foreground">Could not load breakdown.</p>
        ) : o.status === "unconfigured" ? (
          <p className="text-sm text-muted-foreground py-6">This outlet has no capacity/ratios configured yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2 mb-4 text-center">
              <Metric label="Pax" value={o.effectivePax ?? "—"} />
              <Metric label="Req" value={o.totals.required} />
              <Metric label="Avail" value={o.totals.available} />
              <Metric label="Present" value={o.totals.present} />
            </div>
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="grid grid-cols-[1.4fr_repeat(4,0.7fr)] gap-1 px-3 py-2 bg-muted text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                <span>Role</span><span className="text-center">Req</span><span className="text-center">Avail</span><span className="text-center">+/−</span><span className="text-center">Status</span>
              </div>
              <div className="divide-y divide-border">
                {o.roles.map((r) => {
                  const st = STATUS[r.status];
                  const delta = r.excess - r.shortage;
                  return (
                    <div key={r.positionId} className="grid grid-cols-[1.4fr_repeat(4,0.7fr)] gap-1 items-center px-3 py-2">
                      <span className="text-sm text-foreground truncate">{r.positionName}</span>
                      <span className="text-sm text-center text-foreground">{r.required}</span>
                      <span className="text-sm text-center text-foreground">{r.available}</span>
                      <span className={`text-sm text-center font-semibold ${delta > 0 ? "text-info" : delta < 0 ? "text-destructive" : "text-muted-foreground"}`}>{delta === 0 ? "0" : delta > 0 ? `+${delta}` : delta}</span>
                      <span className="flex justify-center"><span className={`w-2 h-2 rounded-full ${st.dot}`} title={st.label} /></span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
