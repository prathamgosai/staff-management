"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import {
  Store, Sparkles, Loader2, Users, ChevronRight, AlertTriangle, Info,
} from "lucide-react";

interface Category { id: string; name: string; }
interface PredictedRole { positionId: string; positionName: string; category: string; headcount: number; monthlyCost: number | null; }
interface PredictionResult {
  strategyVersion: string; effectivePax: number; totalStaff: number;
  monthlyPayroll: number; payrollComplete: boolean; costPerPax: number | null; paxPerStaff: number | null;
  roles: PredictedRole[];
  departmentBreakdown: { category: string; headcount: number; monthlyCost: number | null }[];
}

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

/**
 * New-Restaurant Staffing Predictor (dashboard card). "If we open a new outlet, how many staff
 * do we need?" — pick the cuisine (from the menu) + expected peak covers, and the existing Staff
 * Predictor (POST /predictions) sizes the team from your saved category ratio templates, falling
 * back to company seating defaults for a cuisine you haven't calibrated yet. Self-hides without
 * predictions:run. The full breakdown + payroll lives at /predictions.
 */
export function NewRestaurantPredictorCard() {
  const user = useAuthStore((s) => s.user);
  const canRun = hasPermission(user, "predictions:run");

  const [categoryName, setCategoryName] = useState("");
  const [pax, setPax] = useState("");
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [usedCategory, setUsedCategory] = useState<string>("");

  const cats = useQuery<{ data: Category[] }>({
    queryKey: ["restaurant-categories"],
    queryFn: () => apiClient.get("/settings/restaurant-categories").then((r) => r.data),
    staleTime: 300_000,
    enabled: canRun,
    retry: false,
  });

  const run = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { expectedDinnerPax: Number(pax) };
      if (categoryName) body.categoryName = categoryName;
      return apiClient.post("/predictions", body).then((r) => r.data as { data: PredictionResult });
    },
    onSuccess: (r) => { setResult(r.data); setUsedCategory(categoryName); },
  });

  if (!canRun) return null;

  const canSubmit = Number(pax) > 0 && !run.isPending;
  // The uncalibrated fallback synthesises "<Dept> (company default)" role lines — detect it so we
  // can tell the user whether the estimate used their own cuisine ratios or company seating defaults.
  const isFallback = !!result && result.roles.some((r) => r.positionName.includes("(company default)"));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Store size={18} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Plan a new restaurant</h2>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
        <p className="text-sm text-muted-foreground -mt-1 mb-4">
          Thinking of opening an outlet? Enter the cuisine and expected covers — we&apos;ll size the team from how you staff similar restaurants.
        </p>

        {/* Inputs */}
        <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_auto] sm:items-end">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Cuisine / format</label>
            <select
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Company default (all cuisines)</option>
              {(cats.data?.data ?? []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Expected peak covers</label>
            <input
              value={pax}
              onChange={(e) => setPax(e.target.value.replace(/[^\d]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && run.mutate()}
              inputMode="numeric"
              placeholder="e.g. 120"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={() => run.mutate()}
            disabled={!canSubmit}
            className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold px-4 py-2.5 rounded-xl text-sm transition h-[42px]"
          >
            {run.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            Predict staff
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Peak covers = the busiest single shift (lunch or dinner).
        </p>

        {run.isError && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2 mt-3">
            Couldn&apos;t run the prediction. Please try again.
          </p>
        )}

        {/* Result */}
        {result && (
          <div className="mt-5 border-t border-border pt-5 space-y-4">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">You&apos;ll need about</p>
                <p className="text-4xl font-black text-foreground leading-tight">
                  {result.totalStaff} <span className="text-xl font-bold text-muted-foreground">staff</span>
                </p>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>for ~{result.effectivePax} peak covers{usedCategory ? ` · ${usedCategory}` : ""}</p>
                {result.paxPerStaff != null && <p>≈ {result.paxPerStaff} covers per staff member</p>}
                {result.monthlyPayroll > 0 && (
                  <p>est. payroll {inr(result.monthlyPayroll)}/mo{result.payrollComplete ? "" : " (partial)"}</p>
                )}
              </div>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                isFallback
                  ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300"
                  : "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
              }`}>
                {isFallback ? "Company-default estimate" : `Calibrated for ${usedCategory}`}
              </span>
            </div>

            {/* Department breakdown */}
            <div className="flex flex-wrap gap-2">
              {result.departmentBreakdown.map((d) => (
                <span key={d.category} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-muted text-foreground">
                  <Users size={12} className="text-muted-foreground" />
                  {d.category}: {d.headcount}
                </span>
              ))}
            </div>

            {/* Per-role list */}
            {result.roles.length > 0 && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_auto] gap-2 px-4 py-2 bg-muted border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                  <span>Role</span><span className="text-right">Headcount</span>
                </div>
                <div className="divide-y divide-border max-h-64 overflow-y-auto">
                  {result.roles.map((r) => (
                    <div key={r.positionId} className="grid grid-cols-[1fr_auto] gap-2 items-center px-4 py-2">
                      <span className="text-sm text-foreground truncate">
                        {r.positionName.replace(" (company default)", "")}
                        <span className="text-[11px] text-muted-foreground"> · {r.category}</span>
                      </span>
                      <span className="text-sm text-right font-semibold text-foreground">{r.headcount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isFallback ? (
              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                <Info size={12} className="mt-0.5 shrink-0" />
                <span>No saved ratios for this cuisine yet — estimated from your company seating ratios.</span>
              </p>
            ) : result.roles.length <= 2 ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>This cuisine has only a few saved ratios, so the estimate may be low.</span>
              </p>
            ) : null}

            <Link href="/predictions" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Full breakdown &amp; payroll planner <ChevronRight size={14} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
