"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { FileText, AlertTriangle, CalendarClock, UploadCloud, ShieldAlert, ChevronRight } from "lucide-react";
import { format } from "date-fns";

interface Widgets {
  expiringIn30Days: number;
  employeesMissingMandatory: number;
  recentlyUploaded: { id: string; staffId: string; staffName: string; docType: string; typeName: string | null; createdAt: string }[];
}
interface MissingRow { staffId: string; staffName: string; outletName: string | null; docType: string; typeName: string | null; }
interface ExpiringRow { id: string; staffId: string; staffName: string; outletName: string | null; docType: string; typeName: string | null; expiresOn: string; status: string; }

const MANDATORY_FILTERS = [
  { value: "", label: "All mandatory" },
  { value: "aadhaar", label: "Missing Aadhaar" },
  { value: "pan", label: "Missing PAN" },
  { value: "bank_passbook", label: "Missing Bank details" },
];

export default function DocumentsCompliancePage() {
  const user = useAuthStore((s) => s.user);
  const allowed = hasPermission(user, "documents:status");
  const [missingType, setMissingType] = useState("");
  const [days, setDays] = useState(30);

  const widgets = useQuery<{ data: Widgets }>({
    queryKey: ["document-widgets"],
    queryFn: () => apiClient.get("/documents/widgets").then((r) => r.data),
    staleTime: 30_000, enabled: allowed,
  });
  const missing = useQuery<{ data: MissingRow[] }>({
    queryKey: ["documents-missing", missingType],
    queryFn: () => apiClient.get("/documents/missing", { params: missingType ? { type: missingType } : {} }).then((r) => r.data),
    staleTime: 30_000, enabled: allowed,
  });
  const expiring = useQuery<{ data: ExpiringRow[] }>({
    queryKey: ["documents-expiring", days],
    queryFn: () => apiClient.get("/documents/expiring", { params: { days } }).then((r) => r.data),
    staleTime: 30_000, enabled: allowed,
  });

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md text-center py-20">
        <ShieldAlert className="mx-auto text-muted-foreground mb-3" size={28} />
        <p className="text-sm text-muted-foreground">You don’t have access to document compliance.</p>
      </div>
    );
  }

  const w = widgets.data?.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><FileText size={18} /></div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Document compliance</h1>
          <p className="text-sm text-muted-foreground">Missing, expiring and recently uploaded staff documents.</p>
        </div>
      </div>

      {/* Widgets */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<CalendarClock size={16} />} tone="warning" label="Expiring in 30 days"
          value={widgets.isLoading ? null : w?.expiringIn30Days ?? 0} />
        <StatCard icon={<AlertTriangle size={16} />} tone="destructive" label="Staff missing mandatory docs"
          value={widgets.isLoading ? null : w?.employeesMissingMandatory ?? 0} />
        <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 mb-2">
            <UploadCloud size={14} /> Recently uploaded
          </p>
          {widgets.isLoading ? (
            <div className="space-y-1.5">{[0, 1, 2].map((i) => <div key={i} className="h-4 bg-muted rounded animate-pulse" />)}</div>
          ) : (w?.recentlyUploaded.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recent.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {w!.recentlyUploaded.slice(0, 4).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <Link href={`/staff/${r.staffId}`} className="truncate text-foreground hover:underline">{r.staffName}</Link>
                  <span className="text-xs text-muted-foreground shrink-0">{r.typeName ?? r.docType}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Missing */}
      <section className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">Missing documents</h2>
          <select value={missingType} onChange={(e) => setMissingType(e.target.value)}
            className="border border-border rounded-lg px-2.5 py-1.5 text-xs bg-card text-foreground outline-none focus:ring-2 focus:ring-ring">
            {MANDATORY_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <ComplianceTable
          loading={missing.isLoading}
          rows={(missing.data?.data ?? []).map((r) => ({ staffId: r.staffId, staffName: r.staffName, outletName: r.outletName, right: r.typeName ?? r.docType, rightTone: "muted" as const }))}
          empty="No missing documents for this filter. 🎉"
        />
      </section>

      {/* Expiring */}
      <section className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">Expiring documents</h2>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="border border-border rounded-lg px-2.5 py-1.5 text-xs bg-card text-foreground outline-none focus:ring-2 focus:ring-ring">
            {[30, 60, 90].map((d) => <option key={d} value={d}>Within {d} days</option>)}
          </select>
        </div>
        <ComplianceTable
          loading={expiring.isLoading}
          rows={(expiring.data?.data ?? []).map((r) => ({
            staffId: r.staffId, staffName: r.staffName, outletName: r.outletName,
            right: `${r.typeName ?? r.docType} · ${format(new Date(r.expiresOn), "d MMM yyyy")}`, rightTone: "warning" as const,
          }))}
          empty="No documents expiring in this window."
        />
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number | null; tone: "warning" | "destructive" }) {
  const toneCls = tone === "warning" ? "text-warning" : "text-destructive";
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 mb-2">
        <span className={toneCls}>{icon}</span> {label}
      </p>
      {value === null ? <div className="h-9 w-16 bg-muted rounded animate-pulse" /> : <p className={`text-3xl font-black ${value > 0 ? toneCls : "text-foreground"}`}>{value}</p>}
    </div>
  );
}

function ComplianceTable({
  loading, rows, empty,
}: { loading: boolean; rows: { staffId: string; staffName: string; outletName: string | null; right: string; rightTone: "muted" | "warning" }[]; empty: string }) {
  if (loading) return <div className="p-5 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}</div>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground text-center py-10">{empty}</p>;
  return (
    <div className="divide-y divide-border max-h-96 overflow-y-auto">
      {rows.map((r, i) => (
        <Link key={`${r.staffId}-${i}`} href={`/staff/${r.staffId}`}
          className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{r.staffName}</p>
            {r.outletName && <p className="text-xs text-muted-foreground truncate">{r.outletName}</p>}
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.rightTone === "warning" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>{r.right}</span>
          <ChevronRight size={15} className="text-muted-foreground shrink-0" />
        </Link>
      ))}
    </div>
  );
}
