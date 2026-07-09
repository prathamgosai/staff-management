"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { TrendingUp } from "lucide-react";
import { format } from "date-fns";

interface Day {
  date: string; dow: number; forecastPax: number | null;
  suggested: number | null; rostered: number; delta: number | null; status: string;
}
interface Suggestions { outletId: string; weekStart: string; coversPerOnDutyStaff: number; days: Day[]; }

/**
 * Compact "forecast vs roster" strip for the selected outlet/week. Self-hides without
 * forecast:read, on error (before setup), or when there's no history to forecast from.
 */
export function ForecastStrip({ outletId, weekStart }: { outletId: string; weekStart: string }) {
  const user = useAuthStore((s) => s.user);
  const canView = hasPermission(user, "forecast:read");

  const { data, isError } = useQuery<{ data: Suggestions }>({
    queryKey: ["staffing-suggestions", outletId, weekStart],
    queryFn: () => apiClient.get("/forecasting/staffing-suggestions", { params: { outletId, weekStart } }).then((r) => r.data),
    enabled: canView && !!outletId && !!weekStart,
    staleTime: 60_000,
    retry: false,
  });

  if (!canView || isError) return null;
  const days = data?.data?.days ?? [];
  const hasHistory = days.some((d) => d.status !== "insufficient_data");
  if (!hasHistory) return null;

  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={15} className="text-muted-foreground" />
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Forecast vs roster</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {days.map((d) => {
          const short = d.delta != null && d.delta < 0;
          const surplus = d.delta != null && d.delta > 0;
          return (
            <div key={d.date} className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-center">
              <p className="text-xs font-semibold text-foreground">{format(new Date(`${d.date}T00:00:00`), "EEE d")}</p>
              {d.status === "insufficient_data" ? (
                <p className="text-xs text-muted-foreground mt-2">no history</p>
              ) : (
                <>
                  <p className="text-lg font-black text-foreground mt-0.5">{d.forecastPax}<span className="text-[11px] font-normal text-muted-foreground"> pax</span></p>
                  <p className={`text-[11px] font-semibold mt-0.5 ${short ? "text-red-600 dark:text-red-400" : surplus ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                    sug {d.suggested} · rost {d.rostered}
                    {d.delta != null && d.delta !== 0 ? ` (${d.delta > 0 ? "+" : ""}${d.delta})` : ""}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
