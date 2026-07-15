"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { Calculator, Loader2, Users, Info, Building2 } from "lucide-react";

interface Projection {
  plannedPax: number;
  plannedTables: number | null;
  paxInferred: boolean;
  paxPerTableAssumed: number | null;
  categories: { category: string; required: number }[];
  requiredTotal: number;
  comparableOutlets: { outletId: string; name: string; maxPax: number; actualStaff: number }[];
  expansionPool: { poolSize: number; coveragePct: number | null };
}

export default function NewOutletPlannerPage() {
  const user = useAuthStore((s) => s.user);
  const canView = hasPermission(user, "allocation:read");
  const [pax, setPax] = useState("");
  const [tables, setTables] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const proj = useMutation({
    mutationFn: () =>
      apiClient
        .post("/planning/staffing-projection", {
          plannedPax: pax.trim() ? Number(pax) : undefined,
          plannedTables: tables.trim() ? Number(tables) : undefined,
        })
        .then((r) => r.data.data as Projection),
    onError: (e) => {
      const m = (e as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
      setErr(Array.isArray(m) ? m.join(", ") : m ?? "Could not calculate. Please try again.");
    },
  });

  if (!canView) {
    return (
      <div className="mx-auto max-w-lg py-24 text-center">
        <p className="font-semibold text-foreground">You don&apos;t have access to the planner.</p>
        <p className="text-sm text-muted-foreground mt-1">It requires the Allocation (view) permission.</p>
      </div>
    );
  }

  function submit() {
    setErr(null);
    if (!pax.trim() && !tables.trim()) { setErr("Enter planned pax or tables."); return; }
    proj.mutate();
  }

  const r = proj.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Calculator size={18} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">New-outlet staffing planner</h1>
          <p className="text-sm text-muted-foreground">Estimate the team a future outlet will need.</p>
        </div>
      </div>

      {/* Inputs */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Planned max pax</label>
            <input value={pax} onChange={(e) => setPax(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="e.g. 100"
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Planned tables (optional)</label>
            <input value={tables} onChange={(e) => setTables(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="e.g. 18"
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        {err && <p className="text-xs text-red-600 mt-3">{err}</p>}
        <button onClick={submit} disabled={proj.isPending}
          className="mt-4 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition">
          {proj.isPending ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />}
          Calculate
        </button>
        <p className="text-[11px] text-muted-foreground mt-2">Give pax, or just tables (we estimate ~5.3 pax/table).</p>
      </div>

      {r && (
        <div className="space-y-5">
          {/* Headline */}
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 text-center">
            <p className="text-sm text-muted-foreground">You&apos;ll need about</p>
            <p className="text-5xl font-black text-foreground mt-1">{r.requiredTotal} <span className="text-2xl font-bold text-muted-foreground">staff</span></p>
            <p className="text-xs text-muted-foreground mt-2">
              for ~{r.plannedPax} pax
              {r.paxInferred ? ` (estimated from ${r.plannedTables} tables × ${r.paxPerTableAssumed} pax/table)` : ""}
            </p>
          </div>

          {/* Per-category */}
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">By category</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {r.categories.map((c) => (
                <div key={c.category} className="bg-card rounded-xl border border-border p-4">
                  <p className="text-xs text-muted-foreground font-medium">{c.category}</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5">{c.required}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Expansion pool */}
          <div className="bg-card rounded-2xl border border-border p-5 flex items-start gap-3">
            <Users size={18} className="text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-sm">
              {r.expansionPool.poolSize > 0 ? (
                <p className="text-foreground">
                  <span className="font-semibold">Expansion pool: {r.expansionPool.poolSize} staff</span>
                  {r.expansionPool.coveragePct != null && <> → covers ~{r.expansionPool.coveragePct}% of this outlet.</>}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  No Expansion pool is configured. Create an outlet named “Expansion” and assign a new-openings bench to track coverage here.
                </p>
              )}
            </div>
          </div>

          {/* Comparable outlets */}
          {r.comparableOutlets.length > 0 && (
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                <Building2 size={14} className="text-muted-foreground" />
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Comparable outlets (±20% pax)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="text-left font-semibold px-5 py-2">Outlet</th>
                      <th className="text-right font-semibold px-3 py-2">Max pax</th>
                      <th className="text-right font-semibold px-5 py-2">Actual staff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.comparableOutlets.map((o) => (
                      <tr key={o.outletId} className="border-b border-border last:border-0">
                        <td className="px-5 py-2.5"><Link href={`/outlets/${o.outletId}`} className="font-medium text-foreground hover:text-blue-600">{o.name}</Link></td>
                        <td className="text-right px-3 py-2.5 text-muted-foreground">{o.maxPax}</td>
                        <td className="text-right px-5 py-2.5 font-semibold text-foreground">{o.actualStaff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs text-muted-foreground flex items-start gap-2">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>Estimates from your current group ratios — <Link href="/settings/ratio-templates" className="text-blue-600 hover:underline">tune ratio templates in Settings</Link>.</span>
          </p>
        </div>
      )}
    </div>
  );
}
