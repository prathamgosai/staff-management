"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { Table2, Clock, TrendingUp, Users, ChevronRight, Sparkles, BrainCircuit } from "lucide-react";

interface OutletLite { id: string; name: string; code?: string }
interface Prediction {
  outletId: string; outletName: string; date: string; dayOfWeek: number;
  tableCount: number | null; maxPax: number | null;
  peakHours: string | null; peakHoursEstimated?: boolean;
  predictedPax: number | null;
  method: "historical" | "capacity_model" | "unavailable";
  confidence: "high" | "medium" | "low" | "estimated" | "none";
  historicalSamples: number; coversPerOnDutyStaff: number; recommendedStaff: number | null;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function methodBadge(p: Prediction): { label: string; cls: string } {
  if (p.method === "historical") {
    return {
      label: `AI · historical (${p.historicalSamples} wk${p.historicalSamples === 1 ? "" : "s"})`,
      cls: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    };
  }
  if (p.method === "capacity_model") {
    return { label: "AI · capacity estimate", cls: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300" };
  }
  return { label: "not enough data", cls: "bg-muted text-muted-foreground" };
}

/**
 * PAX Prediction & Staffing Requirements — automated per-outlet forecast. Calls the hybrid
 * prediction endpoint (recency-weighted historical model when POS covers exist, else a
 * capacity model from seats × day-of-week turn factor) so a real predicted PAX + recommended
 * staff always show. Improves automatically as pax history is imported.
 */
export function PaxPredictionCard() {
  const user = useAuthStore((s) => s.user);
  const canForecast = hasPermission(user, "forecast:read");
  const [outletId, setOutletId] = useState("");

  const outletsQ = useQuery<{ data: OutletLite[] }>({
    queryKey: ["outlets-basic"],
    queryFn: () => apiClient.get("/outlets").then((r) => r.data),
    staleTime: 300_000,
  });
  const outlets = outletsQ.data?.data ?? [];
  useEffect(() => {
    const list = outletsQ.data?.data ?? [];
    if (!outletId && list.length) setOutletId(list[0].id);
  }, [outletsQ.data, outletId]);

  const predQ = useQuery<{ data: Prediction }>({
    queryKey: ["pax-prediction", outletId],
    queryFn: () => apiClient.get(`/forecasting/pax-prediction/${outletId}`).then((r) => r.data),
    enabled: !!outletId && canForecast, retry: false, staleTime: 60_000,
  });

  const p = predQ.data?.data;
  const loading = outletsQ.isLoading || (canForecast && predQ.isLoading);
  const badge = p ? methodBadge(p) : null;

  const tiles: { label: string; icon: React.ReactNode; value: string; sub?: string }[] = [
    { label: "Table Count", icon: <Table2 size={18} />, value: p?.tableCount != null ? String(p.tableCount) : "—" },
    { label: "Peak Hours", icon: <Clock size={18} />, value: p?.peakHours ?? "—", sub: p?.peakHoursEstimated ? "typical" : undefined },
    { label: "Predicted PAX", icon: <TrendingUp size={18} />, value: p?.predictedPax != null ? String(p.predictedPax) : "—", sub: p ? DOW[p.dayOfWeek] : undefined },
  ];

  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-foreground flex items-center gap-1.5">
            <Sparkles size={15} className="text-primary" /> PAX Prediction &amp; Staffing Requirements
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">AI-powered daily cover forecast &amp; recommended staffing per outlet</p>
        </div>
        <div className="flex items-center gap-2">
          {badge && !loading && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full ${badge.cls}`}>
              <BrainCircuit size={12} /> {badge.label}
            </span>
          )}
          {outlets.length > 0 && (
            <select value={outletId} onChange={(e) => setOutletId(e.target.value)}
              className="border border-border rounded-lg px-3 py-1.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring">
              {outlets.map((ot) => <option key={ot.id} value={ot.id}>{ot.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="bg-muted rounded-xl p-4 text-center">
            <span className="text-muted-foreground/70 mx-auto mb-2 inline-flex">{t.icon}</span>
            <p className="text-xs font-semibold text-muted-foreground">{t.label}</p>
            {loading ? (
              <div className="h-6 w-12 bg-border rounded animate-pulse mx-auto mt-1.5" />
            ) : (
              <p className="text-lg font-bold text-foreground mt-1">
                {t.value}
                {t.sub && <span className="ml-1 text-[10px] font-medium text-muted-foreground align-middle">{t.sub}</span>}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Recommended staffing from the predicted PAX */}
      {!loading && p && p.recommendedStaff != null ? (
        <Link href="/staffing" className="mt-4 flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3 hover:bg-muted transition group">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <Users size={15} className="text-muted-foreground shrink-0" />
            <span className="font-semibold text-foreground">≈ {p.recommendedStaff}</span>
            <span className="text-muted-foreground">staff recommended on duty</span>
            <span className="text-muted-foreground/70 text-xs">· {p.predictedPax} covers ÷ {p.coversPerOnDutyStaff}/staff</span>
          </div>
          <ChevronRight size={15} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
        </Link>
      ) : !loading && p && p.method === "unavailable" ? (
        <p className="mt-4 text-xs text-muted-foreground bg-muted/40 rounded-xl px-4 py-3">
          Set this outlet&apos;s table count &amp; max capacity to enable predictions.{" "}
          <Link href={outletId ? `/outlets/${outletId}` : "/outlets"} className="text-primary font-semibold hover:underline">Configure now →</Link>
        </p>
      ) : !loading && !canForecast ? (
        <p className="mt-4 text-xs text-muted-foreground bg-muted/40 rounded-xl px-4 py-3">You don&apos;t have permission to view forecasts.</p>
      ) : null}

      {!loading && p && p.method === "capacity_model" && (
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          Estimated from seating capacity &amp; typical demand. Import pax history on the{" "}
          <Link href="/planning/pax-import" className="underline hover:text-foreground">pax import</Link> page to upgrade to a data-driven forecast.
        </p>
      )}
    </div>
  );
}
