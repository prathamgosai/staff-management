"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { BrainCircuit, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

interface OutletRow {
  outletId: string; outletName: string; predictedPax: number | null;
  recommendedOnDuty: number | null; currentStaff: number; fairStaff: number;
  demandSharePct: number | null; gap: number;
}
interface Transfer {
  fromOutletId: string; fromOutletName: string; toOutletId: string; toOutletName: string;
  count: number; reason: string;
}
interface Autopilot {
  date: string; coversPerOnDutyStaff: number; outlets: OutletRow[]; transfers: Transfer[];
  summary: { outletsShort: number; outletsSurplus: number; totalShort: number; totalSurplus: number; movesRecommended: number };
}

/**
 * AI Staffing Autopilot — the full closed loop. Reads the prediction-driven autopilot endpoint
 * (predicted PAX per outlet → demand-weighted fair-share → surplus/shortage → cross-outlet
 * transfer recommendations) and presents the recommended staff moves, each deep-linking into the
 * allocation flow to execute. Advisory: a human approves the actual moves.
 */
export function StaffingAutopilotCard() {
  const user = useAuthStore((s) => s.user);
  const canForecast = hasPermission(user, "forecast:read");
  const [open, setOpen] = useState(false);

  const q = useQuery<{ data: Autopilot }>({
    queryKey: ["staffing-autopilot"],
    queryFn: () => apiClient.get("/forecasting/staffing-autopilot").then((r) => r.data),
    enabled: canForecast, retry: false, staleTime: 60_000,
  });
  const d = q.data?.data;
  const loading = canForecast && q.isLoading;

  if (!canForecast) return null;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-foreground flex items-center gap-1.5">
            <BrainCircuit size={16} className="text-primary" /> AI Staffing Autopilot
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Rebalances staff across outlets to match predicted demand — automatically</p>
        </div>
        {d && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300">{d.summary.movesRecommended} moves</span>
            <span className="px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">{d.summary.outletsShort} short</span>
            <span className="px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">{d.summary.outletsSurplus} surplus</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-10 text-center text-muted-foreground"><Loader2 size={22} className="animate-spin mx-auto" /></div>
      ) : !d ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Couldn&apos;t load the autopilot.</p>
      ) : d.transfers.length === 0 ? (
        <div className="py-6 text-center">
          <CheckCircle2 size={26} className="mx-auto text-success mb-2" />
          <p className="text-sm font-semibold text-foreground">Staff are balanced to predicted demand</p>
          <p className="text-xs text-muted-foreground mt-0.5">No transfers needed today. The autopilot re-checks as forecasts change.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {d.transfers.map((t, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-4 py-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm min-w-0">
                <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary font-bold text-xs">{t.count}</span>
                <span className="font-semibold text-foreground truncate">{t.fromOutletName}</span>
                <ArrowRight size={15} className="text-muted-foreground shrink-0" />
                <span className="font-semibold text-foreground truncate">{t.toOutletName}</span>
              </div>
              <Link
                href={`/allocation?from=${t.fromOutletId}&to=${t.toOutletId}`}
                className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Create transfer <ArrowRight size={13} />
              </Link>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground/80 px-1 pt-1">
            {d.transfers[0]?.reason} — moves are advisory; you approve each in Allocation.
          </p>
        </div>
      )}

      {/* Per-outlet demand breakdown */}
      {d && d.outlets.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Per-outlet predicted demand &amp; balance
          </button>
          {open && (
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="py-1.5 pr-2 font-semibold">Outlet</th>
                    <th className="py-1.5 px-2 font-semibold text-right">Predicted PAX</th>
                    <th className="py-1.5 px-2 font-semibold text-right">Demand</th>
                    <th className="py-1.5 px-2 font-semibold text-right">Fair staff</th>
                    <th className="py-1.5 px-2 font-semibold text-right">Current</th>
                    <th className="py-1.5 pl-2 font-semibold text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.outlets.map((o) => (
                    <tr key={o.outletId} className="text-foreground">
                      <td className="py-1.5 pr-2">{o.outletName}</td>
                      <td className="py-1.5 px-2 text-right">{o.predictedPax ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right text-muted-foreground">{o.demandSharePct != null ? `${o.demandSharePct}%` : "—"}</td>
                      <td className="py-1.5 px-2 text-right">{o.fairStaff}</td>
                      <td className="py-1.5 px-2 text-right">{o.currentStaff}</td>
                      <td className={`py-1.5 pl-2 text-right font-semibold ${o.gap > 0 ? "text-emerald-600 dark:text-emerald-400" : o.gap < 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                        {o.gap > 0 ? `+${o.gap}` : o.gap}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
