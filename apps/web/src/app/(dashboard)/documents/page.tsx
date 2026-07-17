"use client";

import { useState, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { useDebounce } from "@/hooks/use-debounce";
import {
  FileText, AlertTriangle, CalendarClock, UploadCloud, ShieldAlert, ChevronRight,
  Search, X, ChevronLeft, Loader2,
} from "lucide-react";
import { format } from "date-fns";

interface Widgets {
  expiringIn30Days: number;
  employeesMissingMandatory: number;
  recentlyUploaded: { id: string; staffId: string; staffName: string; docType: string; typeName: string | null; createdAt: string }[];
}
interface MissingRow { staffId: string; staffName: string; outletName: string | null; brandName: string | null; docType: string; typeName: string | null; }
interface Pagination { page: number; limit: number; total: number; totalPages: number }
/** /outlets already returns brand_id + brand_name, so both dropdowns come from this one list. */
interface OutletRow { id: string; name: string; brand_id: string; brand_name: string }
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

  // Missing-documents filters
  const [search, setSearch] = useState("");
  const [brandId, setBrandId] = useState("");
  const [outletId, setOutletId] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const widgets = useQuery<{ data: Widgets }>({
    queryKey: ["document-widgets"],
    queryFn: () => apiClient.get("/documents/widgets").then((r) => r.data),
    staleTime: 30_000, enabled: allowed,
  });

  const outlets = useQuery<{ data: OutletRow[] }>({
    queryKey: ["outlets"],
    queryFn: () => apiClient.get("/outlets").then((r) => r.data),
    staleTime: 300_000, enabled: allowed,
  });

  // Restaurants and their outlets are both derived from the single /outlets
  // response — a dependent fetch would add a spinner and a race for data we hold.
  const brands = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of outlets.data?.data ?? []) if (o.brand_id) seen.set(o.brand_id, o.brand_name);
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [outlets.data]);

  /**
   * Outlets grouped under their restaurant, narrowed to one restaurant when a
   * brand is picked. The dropdown stays usable with no restaurant selected —
   * there are only ~12 outlets, so forcing a two-step choice to reach one costs
   * more than it saves.
   */
  const outletGroups = useMemo(() => {
    const rows = (outlets.data?.data ?? []).filter((o) => !brandId || o.brand_id === brandId);
    const groups = new Map<string, OutletRow[]>();
    for (const o of rows) {
      const key = o.brand_name ?? "Other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(o);
    }
    return [...groups]
      .map(([brand, list]) => ({ brand, list: list.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.brand.localeCompare(b.brand));
  }, [outlets.data, brandId]);

  const missing = useQuery<{ data: MissingRow[]; pagination: Pagination }>({
    queryKey: ["documents-missing", missingType, debouncedSearch, brandId, outletId, page],
    queryFn: () => apiClient.get("/documents/missing", {
      params: {
        ...(missingType ? { type: missingType } : {}),
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        ...(brandId ? { brandId } : {}),
        ...(outletId ? { outletId } : {}),
        page, limit: 20,
      },
    }).then((r) => r.data),
    staleTime: 30_000, enabled: allowed,
    // Keep the previous page visible while the next loads, so paging and typing
    // don't flash the list away to a skeleton.
    placeholderData: keepPreviousData,
  });

  /** Changing restaurant invalidates any outlet chosen under the old one. */
  function selectBrand(id: string) {
    setBrandId(id);
    setOutletId("");
    setPage(1);
  }
  function clearFilters() {
    setSearch(""); setBrandId(""); setOutletId(""); setMissingType(""); setPage(1);
  }
  const filtersActive = !!(search || brandId || outletId || missingType);
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
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">
            Missing documents
            {missing.data && (
              <span className="ml-2 font-normal text-xs text-muted-foreground">
                {missing.data.pagination.total.toLocaleString()} result{missing.data.pagination.total === 1 ? "" : "s"}
              </span>
            )}
          </h2>
          <select value={missingType} onChange={(e) => { setMissingType(e.target.value); setPage(1); }}
            className="border border-border rounded-lg px-2.5 py-1.5 text-xs bg-card text-foreground outline-none focus:ring-2 focus:ring-ring">
            {MANDATORY_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>

        {/* Filter row — stacks on mobile, one row from sm up */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search staff name…"
              aria-label="Search staff name"
              className="w-full text-sm border border-border rounded-lg pl-8 pr-8 py-1.5 bg-card text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            {/* Spinner only while a *new* search is in flight, not on first paint */}
            {missing.isFetching && !missing.isLoading && (
              <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          <select value={brandId} onChange={(e) => selectBrand(e.target.value)} aria-label="Select restaurant"
            className="text-sm border border-border rounded-lg px-2.5 py-1.5 bg-card text-foreground outline-none focus:ring-2 focus:ring-ring sm:w-44">
            <option value="">All restaurants</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          <select value={outletId} onChange={(e) => { setOutletId(e.target.value); setPage(1); }}
            aria-label="Select outlet"
            className="text-sm border border-border rounded-lg px-2.5 py-1.5 bg-card text-foreground outline-none focus:ring-2 focus:ring-ring sm:w-44">
            <option value="">All outlets</option>
            {outletGroups.map((g) => (
              <optgroup key={g.brand} label={g.brand}>
                {g.list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </optgroup>
            ))}
          </select>

          {filtersActive && (
            <button onClick={clearFilters}
              className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 transition shrink-0">
              <X size={13} /> Clear
            </button>
          )}
        </div>

        <ComplianceTable
          loading={missing.isLoading}
          rows={(missing.data?.data ?? []).map((r) => ({ staffId: r.staffId, staffName: r.staffName, outletName: r.outletName, right: r.typeName ?? r.docType, rightTone: "muted" as const }))}
          empty={filtersActive ? "No results found. Try clearing the filters." : "No missing documents. 🎉"}
        />

        {missing.data && missing.data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Page {missing.data.pagination.page} of {missing.data.pagination.totalPages}
            </p>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="inline-flex items-center gap-1 text-xs font-semibold border border-border rounded-lg px-2.5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition">
                <ChevronLeft size={13} /> Prev
              </button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= missing.data.pagination.totalPages}
                className="inline-flex items-center gap-1 text-xs font-semibold border border-border rounded-lg px-2.5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition">
                Next <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
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
