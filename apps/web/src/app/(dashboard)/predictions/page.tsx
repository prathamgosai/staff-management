"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { Calculator, Loader2, Sparkles, ShieldAlert, AlertTriangle } from "lucide-react";

interface Category { id: string; name: string; }
interface PredictedRole { positionId: string; positionName: string; category: string; headcount: number; monthlyCost: number | null; }
interface PredictionResult {
  strategyVersion: string; effectivePax: number; totalStaff: number;
  monthlyPayroll: number; payrollComplete: boolean; costPerPax: number | null; paxPerStaff: number | null;
  roles: PredictedRole[];
  departmentBreakdown: { category: string; headcount: number; monthlyCost: number | null }[];
}

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const NUM_FIELDS: { key: string; label: string }[] = [
  { key: "areaSqft", label: "Area (sq ft)" },
  { key: "totalSeating", label: "Total seating" },
  { key: "expectedLunchPax", label: "Expected lunch pax" },
  { key: "expectedDinnerPax", label: "Expected dinner pax" },
  { key: "expectedDailyPax", label: "Expected daily pax" },
  { key: "expectedAvgBill", label: "Expected avg bill (₹)" },
];

export default function PredictorPage() {
  const user = useAuthStore((s) => s.user);
  const allowed = hasPermission(user, "predictions:run");
  const [categoryName, setCategoryName] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<PredictionResult | null>(null);

  const cats = useQuery<{ data: Category[] }>({
    queryKey: ["restaurant-categories"],
    queryFn: () => apiClient.get("/settings/restaurant-categories").then((r) => r.data),
    staleTime: 300_000, enabled: allowed,
  });

  const run = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      if (categoryName) body.categoryName = categoryName;
      for (const f of NUM_FIELDS) if (fields[f.key]) body[f.key] = Number(fields[f.key]);
      return apiClient.post("/predictions", body).then((r) => r.data);
    },
    onSuccess: (r: { data: PredictionResult }) => { setResult(r.data); toast.success("Prediction ready."); },
    onError: (e) => {
      const m = (e as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(", ") : m ?? "Could not run the prediction.");
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
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Uses the peak of lunch/dinner pax (or daily pax) and your category ratio templates → company defaults.</p>
          <button onClick={() => run.mutate()} disabled={run.isPending}
            className="w-full inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold px-4 py-2.5 rounded-xl text-sm transition">
            {run.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Predict staffing
          </button>
        </div>

        {/* Result */}
        <div className="space-y-4">
          {!result ? (
            <div className="bg-card rounded-2xl border border-border shadow-sm p-10 text-center text-sm text-muted-foreground h-full flex items-center justify-center">
              Enter the expected pax and run a prediction.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ResultTile label="Total staff" value={result.totalStaff} />
                <ResultTile label="Monthly payroll" value={result.monthlyPayroll > 0 ? inr(result.monthlyPayroll) : "—"} />
                <ResultTile label="Cost / pax" value={result.costPerPax != null ? inr(result.costPerPax) : "—"} />
                <ResultTile label="Pax / staff" value={result.paxPerStaff ?? "—"} />
              </div>
              {!result.payrollComplete && (
                <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
                  <AlertTriangle size={13} /> Payroll is partial — some roles have no salary set. Add them under Role salaries.
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
