"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { Table2, Clock, TrendingUp, Users, ChevronRight, Sparkles } from "lucide-react";

interface OutletLite { id: string; name: string; code?: string }
interface OutletDetail {
  total_tables?: number | null; max_pax?: number | null; seating_capacity?: number | null;
  operating_hours?: { dayOfWeek?: number | string; openTime?: string; closeTime?: string; open?: string; close?: string; isClosed?: boolean }[] | null;
}
interface Req {
  effectivePax: number | null; status: string;
  totals: { required: number; current: number; available: number; present: number };
}

type Status = "green" | "yellow" | "red" | "blue" | "unconfigured";
const STATUS_DOT: Record<Status, string> = {
  green: "bg-success", yellow: "bg-warning", red: "bg-destructive", blue: "bg-info", unconfigured: "bg-muted-foreground/40",
};
const STATUS_LABEL: Record<Status, string> = {
  green: "Well staffed", yellow: "Minor shortage", red: "Critical shortage", blue: "Excess", unconfigured: "Not set up",
};

/** Today's operating window as "HH:MM–HH:MM", or Closed/—. */
function peakHours(oh: OutletDetail["operating_hours"]): string | null {
  if (!Array.isArray(oh) || oh.length === 0) return null;
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const today = new Date().getDay();
  const match = (x: NonNullable<OutletDetail["operating_hours"]>[number]) =>
    x && (x.dayOfWeek === today || String(x.dayOfWeek).toLowerCase() === days[today]);
  let e = oh.find((x) => match(x) && !x.isClosed) ?? oh.find((x) => match(x));
  if (!e) e = oh.find((x) => !x.isClosed) ?? oh[0];
  if (!e) return null;
  if (e.isClosed) return "Closed today";
  const fmt = (t?: string) => (t ? String(t).slice(0, 5) : "");
  const o = fmt(e.openTime ?? e.open), c = fmt(e.closeTime ?? e.close);
  return o && c ? `${o}–${c}` : null;
}

/**
 * PAX Prediction & Staffing Requirements (replaces the "Coming soon" placeholder). Automated
 * per-outlet: table count + peak hours drive the predicted PAX, which the staffing engine turns
 * into a required-staff figure. Degrades gracefully before the capacity/ratio migrations are
 * applied (tiles show what's available; a "set up capacity" hint otherwise).
 */
export function PaxPredictionCard() {
  const user = useAuthStore((s) => s.user);
  const canStaffing = hasPermission(user, "allocation:read");
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

  const detailQ = useQuery<{ data: OutletDetail }>({
    queryKey: ["outlet-detail", outletId],
    queryFn: () => apiClient.get(`/outlets/${outletId}`).then((r) => r.data),
    enabled: !!outletId, retry: false, staleTime: 60_000,
  });
  const reqQ = useQuery<{ data: Req }>({
    queryKey: ["pax-staffing", outletId],
    queryFn: () => apiClient.get(`/staffing/requirements/${outletId}`).then((r) => r.data),
    enabled: !!outletId && canStaffing, retry: false, staleTime: 60_000,
  });

  const o = detailQ.data?.data;
  const req = reqQ.data?.data;
  const status = (req?.status as Status) ?? "unconfigured";
  const tableCount = o?.total_tables ?? null;
  const predictedPax = req?.effectivePax ?? o?.max_pax ?? null;
  const peak = o ? peakHours(o.operating_hours) : null;
  const loading = outletsQ.isLoading || detailQ.isLoading || (canStaffing && reqQ.isLoading);
  const needsSetup = !loading && predictedPax == null && tableCount == null;

  const tiles: { label: string; icon: React.ReactNode; value: string }[] = [
    { label: "Table Count", icon: <Table2 size={18} />, value: tableCount != null ? String(tableCount) : "—" },
    { label: "Peak Hours", icon: <Clock size={18} />, value: peak ?? "—" },
    { label: "Predicted PAX", icon: <TrendingUp size={18} />, value: predictedPax != null ? String(predictedPax) : "—" },
  ];

  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-foreground flex items-center gap-1.5"><Sparkles size={15} className="text-primary" /> PAX Prediction &amp; Staffing Requirements</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Automated staff requirement from table count, peak hours &amp; predicted pax</p>
        </div>
        {outlets.length > 0 && (
          <select value={outletId} onChange={(e) => setOutletId(e.target.value)}
            className="border border-border rounded-lg px-3 py-1.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring">
            {outlets.map((ot) => <option key={ot.id} value={ot.id}>{ot.name}</option>)}
          </select>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="bg-muted rounded-xl p-4 text-center">
            <span className="text-muted-foreground/70 mx-auto mb-2 inline-flex">{t.icon}</span>
            <p className="text-xs font-semibold text-muted-foreground">{t.label}</p>
            {loading ? (
              <div className="h-6 w-12 bg-border rounded animate-pulse mx-auto mt-1.5" />
            ) : (
              <p className="text-lg font-bold text-foreground mt-1">{t.value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Staffing requirement line */}
      {canStaffing && req && status !== "unconfigured" ? (
        <Link href="/staffing" className="mt-4 flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3 hover:bg-muted transition group">
          <div className="flex items-center gap-2 text-sm">
            <Users size={15} className="text-muted-foreground" />
            <span className="font-semibold text-foreground">{req.totals.required}</span>
            <span className="text-muted-foreground">staff recommended</span>
            <span className="text-muted-foreground">· currently</span>
            <span className="font-semibold text-foreground">{req.totals.current}</span>
            <span className={`ml-1 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_DOT[status]}/15`}>
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} /> {STATUS_LABEL[status]}
            </span>
          </div>
          <ChevronRight size={15} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </Link>
      ) : !loading && needsSetup ? (
        <p className="mt-4 text-xs text-muted-foreground bg-muted/40 rounded-xl px-4 py-3">
          Set the outlet&apos;s capacity &amp; staffing ratios to enable predictions.{" "}
          <Link href={outletId ? `/outlets/${outletId}` : "/outlets"} className="text-primary font-semibold hover:underline">Configure now →</Link>
        </p>
      ) : null}
    </div>
  );
}
