"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { Calculator, Loader2, Sparkles, ShieldAlert, AlertTriangle, Info } from "lucide-react";

interface Category { id: string; name: string; }
interface OutletBaseline {
  outletId: string; outletName: string; categoryName: string | null;
  peakPax: number; avgDailyPax: number | null; actualStaff: number; categoryCalibrated: boolean;
}
interface PredictedRole { positionId: string; positionName: string; category: string; headcount: number; monthlyCost: number | null; }
type PaxSource = "peak_service" | "daily" | "seating_estimate" | "none";
interface PredictionResult {
  strategyVersion: string; effectivePax: number; paxSource: PaxSource; totalStaff: number;
  monthlyPayroll: number; payrollComplete: boolean; costPerPax: number | null; paxPerStaff: number | null;
  monthlyRevenue: number | null; laborCostPct: number | null;
  roles: PredictedRole[];
  departmentBreakdown: { category: string; headcount: number; monthlyCost: number | null }[];
}

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
// "Area (sq ft)" was removed: it was sent, validated and then ignored by the engine, so it
// invited planners to tune a number that could never move the answer.
const NUM_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "totalSeating", label: "Total seating", hint: "Used only if you leave pax blank" },
  { key: "expectedLunchPax", label: "Expected lunch pax" },
  { key: "expectedDinnerPax", label: "Expected dinner pax" },
  { key: "expectedDailyPax", label: "Expected daily pax" },
  { key: "expectedAvgBill", label: "Expected avg bill (₹)", hint: "Drives revenue + labour cost %" },
];

export default function PredictorPage() {
  const user = useAuthStore((s) => s.user);
  const allowed = hasPermission(user, "predictions:run");
  const [categoryName, setCategoryName] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outletId, setOutletId] = useState("");
  const [scenario, setScenario] = useState<number | null>(null);

  // The engine needs a guest count from somewhere. Without one it 400s, which previously
  // surfaced only as a toast — the button looked like it did nothing at all.
  const paxFields = ["expectedLunchPax", "expectedDinnerPax", "expectedDailyPax", "totalSeating"];
  const canPredict = paxFields.some((k) => Number(fields[k]) > 0);

  const cats = useQuery<{ data: Category[] }>({
    queryKey: ["restaurant-categories"],
    queryFn: () => apiClient.get("/settings/restaurant-categories").then((r) => r.data),
    staleTime: 300_000, enabled: allowed,
  });

  // Real outlets to measure a prediction against. Without these, "42 staff required" is a
  // number with nothing to compare it to.
  const baselines = useQuery<{ data: OutletBaseline[] }>({
    queryKey: ["prediction-outlet-baselines"],
    queryFn: () => apiClient.get("/predictions/outlet-baselines").then((r) => r.data),
    staleTime: 300_000, enabled: allowed,
  });
  const outlets = baselines.data?.data ?? [];
  const baseline = outlets.find((o) => o.outletId === outletId) ?? null;

  /** Load an existing outlet's real figures into the form, so it predicts for a known place. */
  function pickOutlet(id: string) {
    setOutletId(id);
    setError(null);
    setResult(null);
    const o = outlets.find((x) => x.outletId === id);
    if (!o) return;
    setCategoryName(o.categoryName ?? "");
    setFields((s) => ({ ...s, expectedDinnerPax: String(o.peakPax), totalSeating: "" }));
  }

  /** Re-run at a multiple of the current pax — the scenario simulator, on real ratios. */
  function runScenario(multiplier: number) {
    const basePax = baseline ? baseline.peakPax : Number(fields.expectedDinnerPax) || Number(fields.expectedDailyPax) || 0;
    if (basePax <= 0) return;
    const next = Math.max(1, Math.round(basePax * multiplier));
    setFields((s) => ({ ...s, expectedDinnerPax: String(next) }));
    setScenario(multiplier);
    // Fire with the new pax directly: setState hasn't landed by the time mutate() reads it.
    run.mutate({ expectedDinnerPax: next });
  }

  const run = useMutation({
    // `override` lets a scenario run at a pax value that isn't in state yet.
    mutationFn: (override?: Record<string, number>) => {
      const body: Record<string, unknown> = {};
      if (categoryName) body.categoryName = categoryName;
      for (const f of NUM_FIELDS) if (fields[f.key]) body[f.key] = Number(fields[f.key]);
      Object.assign(body, override ?? {});
      return apiClient.post("/predictions", body).then((r) => r.data);
    },
    onSuccess: (r: { data: PredictionResult }) => { setResult(r.data); setError(null); toast.success("Prediction ready."); },
    onError: (e) => {
      const m = (e as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
      const msg = Array.isArray(m) ? m.join(", ") : m ?? "Could not run the prediction.";
      // Also held in the panel: a toast disappears, and a failed run otherwise leaves the
      // page looking identical to one that was never run.
      setError(msg);
      toast.error(msg);
    },
  });

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md text-center py-20">
        <ShieldAlert className="mx-auto text-muted-foreground mb-3" size={28} />
        <p className="text-sm text-muted-foreground">You don’t have access to the staff predictor.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Calculator size={18} /></div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Restaurant staff predictor</h1>
          <p className="text-sm text-muted-foreground">Plan staffing + payroll for an outlet you haven’t opened yet.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* Inputs */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-4 h-fit">
          {/* Compare against a real outlet, or plan a new one from scratch. */}
          {outlets.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Compare with an existing outlet</label>
              <select value={outletId} onChange={(e) => pickOutlet(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring">
                <option value="">New outlet (no comparison)</option>
                {outlets.map((o) => (
                  <option key={o.outletId} value={o.outletId}>
                    {o.outletName} — {o.peakPax} peak pax, {o.actualStaff} staff
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">Loads its real peak pax + category, then shows required vs actual.</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Restaurant category</label>
            <select value={categoryName} onChange={(e) => setCategoryName(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring">
              <option value="">Company defaults</option>
              {(cats.data?.data ?? []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          {NUM_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">{f.label}</label>
              <input value={fields[f.key] ?? ""} onChange={(e) => setFields((s) => ({ ...s, [f.key]: e.target.value.replace(/[^\d]/g, "") }))}
                inputMode="numeric" placeholder="—"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring" />
              {/* Say what each field actually does — every one here now changes the answer. */}
              {f.hint && <p className="text-[10px] text-muted-foreground mt-1">{f.hint}</p>}
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Uses the peak of lunch/dinner pax (or daily pax, or an estimate from seating) and your category ratio templates → company defaults.</p>
          <button onClick={() => run.mutate(undefined)} disabled={run.isPending || !canPredict}
            title={canPredict ? undefined : "Enter expected pax (or total seating) first"}
            className="w-full inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-semibold px-4 py-2.5 rounded-xl text-sm transition">
            {run.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Predict staffing
          </button>
          {/* Say why the button is inert, instead of letting it look broken. */}
          {!canPredict && (
            <p className="text-[11px] text-muted-foreground text-center">
              Enter a pax figure (or total seating) above to enable this.
            </p>
          )}
        </div>

        {/* Result */}
        <div className="space-y-4">
          {error && !result ? (
            <div className="bg-card rounded-2xl border border-destructive/30 shadow-sm p-10 text-center h-full flex flex-col items-center justify-center gap-2">
              <AlertTriangle size={20} className="text-destructive" />
              <p className="text-sm font-semibold text-foreground">Couldn&apos;t run the prediction</p>
              <p className="text-sm text-muted-foreground max-w-xs">{error}</p>
            </div>
          ) : !result ? (
            <div className="bg-card rounded-2xl border border-border shadow-sm p-10 h-full flex flex-col items-center justify-center gap-3 text-center">
              <Sparkles size={20} className="text-muted-foreground/60" />
              <p className="text-sm font-semibold text-foreground">No prediction yet</p>
              {/* A worked example beats "enter the expected pax" — it shows what to type. */}
              <p className="text-sm text-muted-foreground max-w-xs">
                Enter how many guests you expect at your busiest service — e.g. <b className="text-foreground">200</b> dinner pax —
                then press Predict staffing.
              </p>
              <p className="text-xs text-muted-foreground/80 max-w-xs">
                Pick a calibrated category (Asian or Casual Dining) to get payroll and labour cost too.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ResultTile label="Total staff" value={result.totalStaff} />
                <ResultTile label="Monthly payroll" value={result.monthlyPayroll > 0 ? inr(result.monthlyPayroll) : "—"} />
                <ResultTile label="Cost / pax" value={result.costPerPax != null ? inr(result.costPerPax) : "—"} />
                <ResultTile label="Pax / staff" value={result.paxPerStaff ?? "—"} />
                {/* Only rendered when an avg bill was given — an em-dash tile would just be noise. */}
                {result.monthlyRevenue != null && (
                  <ResultTile label="Monthly revenue" value={inr(result.monthlyRevenue)} />
                )}
                {result.laborCostPct != null && (
                  <ResultTile label="Labour cost" value={`${result.laborCostPct}% of revenue`} />
                )}
              </div>

              {/* Required vs what this outlet actually employs — the brief's Shortage/Excess,
                  computed from real headcount rather than a predicted "available". */}
              {baseline && (
                <div className="bg-card rounded-2xl border border-border shadow-sm p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      vs {baseline.outletName}
                    </p>
                    {scenario != null && scenario !== 1 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        SCENARIO: {scenario > 1 ? "+" : ""}{Math.round((scenario - 1) * 100)}% PAX
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <ResultTile label="Required" value={result.totalStaff} />
                    <ResultTile label="Actually employed" value={baseline.actualStaff} />
                    <ResultTile
                      label={baseline.actualStaff < result.totalStaff ? "Shortage" : baseline.actualStaff > result.totalStaff ? "Excess" : "Balanced"}
                      value={Math.abs(baseline.actualStaff - result.totalStaff) || "0"}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {baseline.actualStaff < result.totalStaff
                      ? `At ${result.effectivePax} peak covers, ${baseline.outletName} would be short ${result.totalStaff - baseline.actualStaff} staff against the ${baseline.categoryName} ratios.`
                      : baseline.actualStaff > result.totalStaff
                        ? `${baseline.outletName} runs ${baseline.actualStaff - result.totalStaff} more than the ${baseline.categoryName} ratios call for at ${result.effectivePax} covers.`
                        : `${baseline.outletName} is staffed exactly to the ${baseline.categoryName} ratios at ${result.effectivePax} covers.`}
                  </p>
                </div>
              )}

              {/* Scenario simulator: the same calibrated model at a different guest count.
                  Deterministic arithmetic, not a forecast — there is no history to forecast from. */}
              {(baseline || Number(fields.expectedDinnerPax) > 0) && (
                <div className="bg-card rounded-2xl border border-border shadow-sm p-4">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">What if…</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { m: 0.7, label: "−30% quiet" },
                      { m: 0.9, label: "−10%" },
                      { m: 1, label: "Normal" },
                      { m: 1.2, label: "+20% busy" },
                      { m: 1.3, label: "+30% festival" },
                      { m: 1.5, label: "+50% peak" },
                    ].map((s) => (
                      <button key={s.m} onClick={() => runScenario(s.m)} disabled={run.isPending}
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition disabled:opacity-50 ${
                          scenario === s.m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                        }`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Re-runs the same calibrated ratios at a different guest count. Not a forecast — it answers “if this many turn up, who do I need?”
                  </p>
                </div>
              )}

              {/* Never let an estimate read as a figure the planner supplied. */}
              {result.paxSource === "seating_estimate" && (
                <p className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-lg px-3 py-2 inline-flex items-start gap-1.5">
                  <Info size={13} className="mt-0.5 shrink-0" />
                  Estimated {result.effectivePax} peak guests from your seating (assumes 1.5 sittings per service).
                  Enter real pax figures for a firmer answer.
                </p>
              )}

              {!result.payrollComplete && (
                <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
                  <AlertTriangle size={13} /> Payroll is partial — some roles have no salary set, so this covers only part of the team{result.monthlyRevenue != null ? ", and labour cost % is withheld rather than shown too low" : ""}.
                </p>
              )}

              <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="grid grid-cols-[1.6fr_1fr_1.2fr] gap-2 px-5 py-3 bg-muted border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                  <span>Role</span><span className="text-center">Headcount</span><span className="text-right">Monthly cost</span>
                </div>
                <div className="divide-y divide-border">
                  {result.roles.map((r) => (
                    <div key={r.positionId} className="grid grid-cols-[1.6fr_1fr_1.2fr] gap-2 items-center px-5 py-2.5">
                      <span className="text-sm text-foreground truncate">{r.positionName} <span className="text-[11px] text-muted-foreground">· {r.category}</span></span>
                      <span className="text-sm text-center font-semibold text-foreground">{r.headcount}</span>
                      <span className="text-sm text-right text-muted-foreground">{r.monthlyCost != null ? inr(r.monthlyCost) : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Department breakdown</p>
                <div className="flex flex-wrap gap-2">
                  {result.departmentBreakdown.map((d) => (
                    <span key={d.category} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-muted text-foreground">
                      {d.category}: {d.headcount}{d.monthlyCost ? ` · ${inr(d.monthlyCost)}` : ""}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">Based on {result.effectivePax} peak pax · strategy {result.strategyVersion}</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-4">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-xl font-black text-foreground mt-0.5 truncate">{value}</p>
    </div>
  );
}
