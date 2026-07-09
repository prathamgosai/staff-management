"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { Gauge, Users, Sparkles, TrendingUp, TrendingDown } from "lucide-react";

// Lazy — recharts never lands in chunks that don't render this section.
const CapacityChart = dynamic(() => import("./capacity-chart"), {
  ssr: false,
  loading: () => <div className="w-full h-72 bg-muted rounded-xl animate-pulse" />,
});

interface Category { category: string; required: number; actual: number; variance: number; }
interface OutletAnalysis {
  outletId: string; name: string; code: string;
  totalTables: number | null; maxPax: number; paxPerStaff: number | null;
  categories: Category[]; requiredTotal: number; actualTotal: number; variance: number;
}
interface Analysis {
  outlets: OutletAnalysis[];
  totals: { requiredTotal: number; actualTotal: number; variance: number };
  supportUnits: { name: string; actual: number }[];
  activeStaffTotal: number;
}

function VarianceBadge({ v }: { v: number }) {
  const cls = v > 0
    ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
    : v < 0
      ? "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300"
      : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {v > 0 ? <TrendingUp size={11} /> : v < 0 ? <TrendingDown size={11} /> : null}
      {v > 0 ? `+${v}` : v}
    </span>
  );
}

export function CapacityStaffingSection() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const canView = hasPermission(user, "allocation:read");

  const { data, isLoading, isError } = useQuery<{ data: Analysis }>({
    queryKey: ["capacity-analysis"],
    queryFn: () => apiClient.get("/outlets/capacity-analysis").then((r) => r.data),
    staleTime: 60_000,
    enabled: canView,
    retry: false,
  });

  if (!canView) return null;

  const a = data?.data;

  const Heading = (
    <div className="flex items-center gap-2">
      <Gauge size={18} className="text-muted-foreground" />
      <h2 className="text-lg font-bold text-foreground">Capacity &amp; Staffing</h2>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Heading}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 bg-muted rounded-2xl animate-pulse" />)}
        </div>
        <div className="h-72 bg-muted rounded-2xl animate-pulse" />
      </div>
    );
  }

  // Before migration 017 / no capacity set, the endpoint errors or returns no outlets.
  if (isError || !a || a.outlets.length === 0) {
    return (
      <div className="space-y-3">
        {Heading}
        <div className="bg-card rounded-2xl border border-border p-6 text-center">
          <p className="text-sm font-semibold text-foreground">Capacity model not set up yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Set each dine-in outlet&apos;s tables &amp; max pax to see required-vs-actual staffing here.
          </p>
          <Link href="/outlets" className="mt-3 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
            Go to Outlets
          </Link>
        </div>
      </div>
    );
  }

  const supportTotal = a.supportUnits.reduce((s, u) => s + u.actual, 0);
  const variance = a.totals.variance;
  const chartData = a.outlets.map((o) => ({ name: o.name, required: o.requiredTotal, actual: o.actualTotal }));

  return (
    <div className="space-y-4">
      {Heading}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground"><Users size={15} /><p className="text-xs font-semibold uppercase tracking-widest">Total active staff</p></div>
          <p className="text-3xl font-black text-foreground mt-1">{a.activeStaffTotal}</p>
          <p className="text-xs text-muted-foreground mt-1">incl. {supportTotal} in support units</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground"><Sparkles size={15} /><p className="text-xs font-semibold uppercase tracking-widest">Staff required</p></div>
          <p className="text-3xl font-black text-foreground mt-1">{a.totals.requiredTotal}</p>
          <p className="text-xs text-muted-foreground mt-1">capacity model · {a.outlets.length} dine-in outlets</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            {variance >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
            <p className="text-xs font-semibold uppercase tracking-widest">{variance >= 0 ? "Surplus" : "Shortage"}</p>
          </div>
          <p className={`text-3xl font-black mt-1 ${variance > 0 ? "text-emerald-600 dark:text-emerald-400" : variance < 0 ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
            {variance > 0 ? `+${variance}` : variance}
          </p>
          <p className="text-xs text-muted-foreground mt-1">actual − required (dine-in)</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Required vs actual per outlet</p>
        <CapacityChart data={chartData} />
      </div>

      {/* Per-outlet table */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left font-semibold px-5 py-3">Outlet</th>
                <th className="text-right font-semibold px-3 py-3">Tables</th>
                <th className="text-right font-semibold px-3 py-3">Max pax</th>
                <th className="text-right font-semibold px-3 py-3">Required</th>
                <th className="text-right font-semibold px-3 py-3">Actual</th>
                <th className="text-right font-semibold px-3 py-3">Variance</th>
                <th className="text-right font-semibold px-5 py-3">Pax/staff</th>
              </tr>
            </thead>
            <tbody>
              {a.outlets.map((o) => (
                <tr
                  key={o.outletId}
                  onClick={() => router.push(`/outlets/${o.outletId}`)}
                  className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer transition"
                >
                  <td className="px-5 py-3">
                    <p className="font-semibold text-foreground">{o.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{o.code}</p>
                  </td>
                  <td className="text-right px-3 py-3 text-muted-foreground">{o.totalTables ?? "—"}</td>
                  <td className="text-right px-3 py-3 text-muted-foreground">{o.maxPax}</td>
                  <td className="text-right px-3 py-3 font-semibold text-foreground">{o.requiredTotal}</td>
                  <td className="text-right px-3 py-3 font-semibold text-foreground">{o.actualTotal}</td>
                  <td className="text-right px-3 py-3"><VarianceBadge v={o.variance} /></td>
                  <td className="text-right px-5 py-3 text-muted-foreground">{o.paxPerStaff ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
