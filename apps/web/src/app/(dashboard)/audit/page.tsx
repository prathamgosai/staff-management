"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { format } from "date-fns";
import { History, Loader2, RefreshCw, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";

interface AuditRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: unknown;
  new_values: unknown;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
}

const PAGE = 50;

// The entity kinds actually written by the audit service.
const ENTITY_TYPES = ["staff_transfer", "leave_request", "role", "user", "staff"];

// Colour the action badge by its domain prefix (dark-mode safe pairs).
function actionCls(action: string): string {
  if (action.startsWith("transfer")) return "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300";
  if (action.startsWith("leave")) return "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300";
  if (action.startsWith("account.role") || action.startsWith("role")) return "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300";
  if (action.startsWith("account.password")) return "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300";
  if (action.startsWith("staff")) return "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300";
  if (action.startsWith("registration")) return "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300";
  return "bg-muted text-muted-foreground";
}

// Compact one-line rendering of an old/new values JSON blob.
function summarize(v: unknown): string {
  if (v == null) return "—";
  if (typeof v !== "object") return String(v);
  try {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${Array.isArray(val) ? `[${val.length}]` : String(val)}`)
      .join(", ");
  } catch {
    return "—";
  }
}

export default function AuditPage() {
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [offset, setOffset] = useState(0);

  const params = new URLSearchParams();
  if (action) params.set("action", action);
  if (entityType) params.set("entityType", entityType);
  params.set("limit", String(PAGE));
  params.set("offset", String(offset));

  const { data, isLoading, isError, refetch, isFetching } = useQuery<{ data: AuditRow[] }>({
    queryKey: ["audit", action, entityType, offset],
    queryFn: () => apiClient.get(`/audit?${params.toString()}`).then((r) => r.data),
  });
  const rows = data?.data ?? [];

  // Changing a filter always returns to the first page.
  const setFilter = (fn: () => void) => {
    fn();
    setOffset(0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-500/20 rounded-xl flex items-center justify-center">
            <History size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Audit log</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Who changed what, and when — transfers, leave, roles, access &amp; account actions</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-xl px-3 py-2 transition hover:bg-muted"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={action}
          onChange={(e) => setFilter(() => setAction(e.target.value.trim()))}
          placeholder="Filter by action (e.g. transfer.approve)…"
          className="flex-1 min-w-[220px] px-3 py-2.5 border border-border rounded-xl text-sm bg-card shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
        <select
          value={entityType}
          onChange={(e) => setFilter(() => setEntityType(e.target.value))}
          className="px-3 py-2.5 border border-border rounded-xl text-sm bg-card shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">All entity types</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border">
                {["When", "Who", "Action", "Entity", "Change"].map((h) => (
                  <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={5} className="py-16 text-center text-muted-foreground"><Loader2 size={24} className="animate-spin mx-auto" /></td></tr>
              ) : isError ? (
                <tr><td colSpan={5} className="py-16 text-center text-muted-foreground text-sm">
                  <AlertTriangle size={22} className="mx-auto mb-2 text-amber-500" />
                  Couldn&apos;t load the audit log. Please try again.
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="py-16 text-center text-muted-foreground text-sm">No audit entries{action || entityType ? " match these filters" : " yet"}.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/50 transition-colors align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{format(new Date(r.created_at), "d MMM yyyy, HH:mm")}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium text-foreground">{r.user_name || "—"}</div>
                      {r.user_email && <div className="text-xs text-muted-foreground">{r.user_email}</div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${actionCls(r.action)}`}>{r.action}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-foreground">{r.entity_type}</div>
                      {r.entity_id && <div className="text-xs text-muted-foreground font-mono">{r.entity_id.slice(0, 8)}…</div>}
                    </td>
                    <td className="px-4 py-3 max-w-md">
                      {r.old_values != null && (
                        <div className="text-xs text-muted-foreground"><span className="font-semibold">from</span> {summarize(r.old_values)}</div>
                      )}
                      {r.new_values != null && (
                        <div className="text-xs text-foreground"><span className="font-semibold">to</span> {summarize(r.new_values)}</div>
                      )}
                      {r.old_values == null && r.new_values == null && <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{offset > 0 || rows.length === PAGE ? `Showing ${offset + 1}–${offset + rows.length}` : `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
            disabled={offset === 0}
            className="inline-flex items-center gap-1 border border-border rounded-lg px-3 py-1.5 transition hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <button
            onClick={() => setOffset((o) => o + PAGE)}
            disabled={rows.length < PAGE}
            className="inline-flex items-center gap-1 border border-border rounded-lg px-3 py-1.5 transition hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
