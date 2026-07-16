"use client";

import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Search, ArrowUpDown, AlertTriangle, RotateCw, Users } from "lucide-react";

type StaffStatus = "on_shift" | "on_leave" | "off" | "late";

interface StaffToday {
  id: string;
  name: string;
  role: string;
  status: StaffStatus;
  shiftTime?: string | null;
  checkInTime?: string | null;
  leaveType?: string | null;
}

interface OutletDetailResponse {
  outletName: string;
  address?: string | null;
  staff: StaffToday[];
}

const PAGE_SIZE = 20;

// Sort weight so the operationally-relevant rows (people actually working, or
// running late) float to the top of an ascending sort.
const STATUS_RANK: Record<StaffStatus, number> = { on_shift: 0, late: 1, on_leave: 2, off: 3 };

const STATUS_BADGE: Record<StaffStatus, string> = {
  on_shift: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  on_leave: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  off: "bg-muted text-muted-foreground",
  late: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
};
const STATUS_LABEL: Record<StaffStatus, string> = {
  on_shift: "On Shift",
  on_leave: "On Leave",
  off: "Off",
  late: "Late",
};

/**
 * Drill-down table shown beneath the dashboard KPIs when a single outlet is
 * selected. Lists every active staff member for that outlet with their status
 * today (on shift / late / on leave / off). Client-side search, status sort and
 * pagination keep it responsive without extra round-trips.
 */
export function OutletDetail({ outletId }: { outletId: string }) {
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<{ data: OutletDetailResponse }>({
    queryKey: ["outlet-staff-today", outletId],
    queryFn: () => apiClient.get(`/dashboard/outlet/${outletId}/staff-today`).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const detail = data?.data;
  const staff = useMemo(() => detail?.staff ?? [], [detail]);

  // Reset paging whenever the outlet or the search term changes so we never land
  // on a now-empty page.
  useEffect(() => { setPage(0); }, [outletId, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q ? staff.filter((s) => s.name.toLowerCase().includes(q)) : staff.slice();
    rows.sort((a, b) => {
      const diff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      const primary = sortDir === "asc" ? diff : -diff;
      return primary !== 0 ? primary : a.name.localeCompare(b.name);
    });
    return rows;
  }, [staff, search, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
      {/* Heading */}
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-bold text-foreground">{detail?.outletName || "Outlet"}</h2>
        {detail?.address ? (
          <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1">
            <MapPin size={12} /> {detail.address}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5">Today&apos;s staff status</p>
        )}
      </div>

      {/* Search */}
      <div className="px-5 py-3 border-b border-border">
        <div className="relative w-full sm:max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff by name…"
            className="w-full text-sm bg-background border border-border rounded-xl pl-9 pr-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="p-5 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : isError ? (
        <div className="px-5 py-10 text-center">
          <AlertTriangle size={20} className="mx-auto text-destructive mb-2" />
          <p className="text-sm text-muted-foreground mb-3">Couldn&apos;t load this outlet&apos;s staff.</p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            <RotateCw size={13} /> Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-5 py-12 text-center text-muted-foreground text-sm inline-flex flex-col items-center gap-2 w-full">
          <Users size={22} className="text-muted-foreground/50" />
          {search ? "No staff match your search." : "No active staff at this outlet."}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2.5 font-semibold">Staff</th>
                  <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">Role</th>
                  <th className="px-3 py-2.5 font-semibold">
                    <button
                      onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                      className="inline-flex items-center gap-1 hover:text-foreground transition"
                      title="Sort by status"
                    >
                      Status <ArrowUpDown size={12} />
                    </button>
                  </th>
                  <th className="px-5 py-2.5 font-semibold text-right hidden md:table-cell">Shift / Check-in</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                          {s.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{s.name}</p>
                          <p className="text-xs text-muted-foreground sm:hidden truncate">{s.role}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground hidden sm:table-cell">{s.role}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full ${STATUS_BADGE[s.status]}`}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right hidden md:table-cell">
                      {s.status === "on_leave" ? (
                        <span className="text-xs text-muted-foreground">{s.leaveType || "Leave"}</span>
                      ) : s.shiftTime ? (
                        <span className="text-xs text-foreground">
                          {s.shiftTime}
                          {s.checkInTime && <span className="text-muted-foreground"> · in {s.checkInTime}</span>}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination — only when it actually overflows one page */}
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                {isFetching && <span className="ml-2 opacity-60">updating…</span>}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition"
                >
                  Prev
                </button>
                <span className="text-xs text-muted-foreground">{safePage + 1} / {pageCount}</span>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={safePage >= pageCount - 1}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
