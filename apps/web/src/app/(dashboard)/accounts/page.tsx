"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { isAdminRole, canAssignRoles, ASSIGNABLE_ROLES, ROLE_META } from "@workforceiq/shared";
import { format } from "date-fns";
import {
  KeyRound, Search, Loader2, X, Check, Copy, ShieldCheck, RefreshCw, Mail, Hash, UserCog,
} from "lucide-react";

interface Account {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  pending_approval: boolean;
  ticket_number: string | null;
  last_login_at: string | null;
  created_at: string;
  employee_id: string | null;
}

const ROLE_CLS: Record<string, string> = {
  super_admin: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300",
  admin: "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300",
  hr: "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300",
  head_of_house: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300",
  chef: "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300",
  employee: "bg-muted text-muted-foreground",
};

function statusOf(a: Account): { label: string; cls: string } {
  if (a.pending_approval) return { label: "pending", cls: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300" };
  if (!a.is_active) return { label: "inactive", cls: "bg-muted text-muted-foreground" };
  return { label: "active", cls: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" };
}

/* ─── Reset Password Modal ────────────────────────────────────────────── */
function ResetPasswordModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"generate" | "set">("generate");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [tempPwd, setTempPwd] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/auth/accounts/${account.id}/reset-password`, mode === "set" ? { newPassword: pwd.trim() } : {}),
    onSuccess: (res) => {
      const temp = (res.data?.data?.tempPassword as string | undefined) ?? null;
      setTempPwd(temp);
      setDone(true);
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (error) => {
      const e = error as { response?: { data?: { message?: string | string[] } } };
      const m = e?.response?.data?.message;
      setErr(Array.isArray(m) ? m.join(", ") : m ?? "Could not reset password. Please try again.");
    },
  });

  function submit() {
    setErr(null);
    if (mode === "set" && pwd.trim().length < 8) { setErr("Password must be at least 8 characters."); return; }
    mutation.mutate();
  }

  async function copy() {
    const v = tempPwd ?? pwd;
    try { await navigator.clipboard.writeText(v); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl w-96 max-w-[calc(100vw-2rem)] mx-4 p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-foreground">Reset Password</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted"><X size={16} /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-4 truncate">{account.name} · <span className="font-mono">{account.email}</span></p>

        {done ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold">
              <Check size={16} /> Password updated
            </div>
            {tempPwd ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Temporary password (shown once — copy it now)</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted border border-border rounded-xl px-3 py-2.5 text-sm font-mono select-all">{tempPwd}</code>
                  <button onClick={copy} className="p-2.5 rounded-xl border border-border hover:bg-muted transition" title="Copy">
                    {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} className="text-muted-foreground" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Share this with the staff member. They can change it after signing in.</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">The new password you entered is now active for this account.</p>
            )}
            <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm transition">
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMode("generate")}
                className={`px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition ${mode === "generate" ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300" : "border-transparent bg-muted text-foreground hover:bg-muted"}`}>
                Generate temporary
              </button>
              <button onClick={() => setMode("set")}
                className={`px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition ${mode === "set" ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300" : "border-transparent bg-muted text-foreground hover:bg-muted"}`}>
                Set a password
              </button>
            </div>

            {mode === "set" ? (
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">New password (min 8 characters)</label>
                <input value={pwd} onChange={e => setPwd(e.target.value)} type="text" autoComplete="off"
                  placeholder="e.g. Welcome@2026"
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground bg-muted border border-border rounded-xl px-3 py-2.5">
                A secure temporary password will be generated and shown to you once, to hand to the staff member.
              </p>
            )}

            {err && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">{err}</p>}

            <button onClick={submit} disabled={mutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2">
              {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              Reset Password
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────── */
export default function AccountsPage() {
  const myRole = useAuthStore((s) => s.user?.role ?? null);
  const isAdmin = isAdminRole(myRole);
  const canAssign = canAssignRoles(myRole); // only super_admin / HR may change roles
  const isSuperAdmin = myRole === "super_admin"; // only a super admin may reset a super admin password
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [resetting, setResetting] = useState<Account | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<{ data: Account[] }>({
    queryKey: ["accounts"],
    queryFn: () => apiClient.get("/auth/accounts").then(r => r.data),
    staleTime: 30_000,
    enabled: isAdmin,
  });

  const changeRole = useMutation({
    mutationFn: (vars: { userIds: string[]; role: string }) => apiClient.put("/auth/accounts/role", vars),
    onSuccess: (res) => {
      const n = (res.data?.data?.updated as number | undefined) ?? 0;
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setSelectedIds(new Set());
      setBulkRole("");
      setNotice(`Updated access for ${n} account${n === 1 ? "" : "s"}.`);
    },
  });

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto text-center py-24">
        <div className="w-14 h-14 bg-red-50 dark:bg-red-500/15 rounded-full flex items-center justify-center mx-auto mb-3">
          <ShieldCheck size={26} strokeWidth={1.5} className="text-red-400" />
        </div>
        <p className="font-bold text-foreground">Restricted area</p>
        <p className="text-sm text-muted-foreground mt-1">Only administrators can view staff accounts.</p>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const rows = (data?.data ?? []).filter(a =>
    !q || a.email.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (a.employee_id ?? "").toLowerCase().includes(q),
  );

  // Super Admin accounts can't be reassigned, so they're never selectable.
  const selectableRows = rows.filter(a => a.role !== "super_admin");
  const allSelected = selectableRows.length > 0 && selectableRows.every(a => selectedIds.has(a.id));
  const toggleAll = () => {
    setNotice(null);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selectableRows.every(a => next.has(a.id))) selectableRows.forEach(a => next.delete(a.id));
      else selectableRows.forEach(a => next.add(a.id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setNotice(null);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <>
      {resetting && <ResetPasswordModal account={resetting} onClose={() => setResetting(null)} />}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-500/20 rounded-xl flex items-center justify-center">
              <KeyRound size={20} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Staff Accounts</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{data?.data?.length ?? 0} accounts · login IDs, password resets{canAssign ? " &amp; access" : ""}</p>
            </div>
          </div>
          <button onClick={() => refetch()}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-xl px-3 py-2 transition hover:bg-muted">
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {/* Security note */}
        <div className="bg-blue-50 dark:bg-blue-500/15 border border-blue-100 dark:border-blue-500/30 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-300 flex gap-2 items-start">
          <ShieldCheck size={16} className="shrink-0 mt-0.5" />
          <span>Passwords are stored encrypted and can never be displayed. To give someone access, use <b>Reset Password</b> to set a new one or generate a temporary password.</span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by login ID, name, or Employee ID…"
            className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm bg-card shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
        </div>

        {/* Success notice */}
        {notice && (
          <div className="bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 rounded-xl px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <Check size={15} className="shrink-0" /> {notice}
          </div>
        )}

        {/* Bulk "change access" bar — only super_admin / HR see this */}
        {canAssign && selectedIds.size > 0 && (
          <div className="sticky top-2 z-10 flex items-center gap-3 flex-wrap bg-indigo-600 text-white rounded-xl px-4 py-3 shadow-lg">
            <UserCog size={16} className="shrink-0" />
            <span className="font-semibold text-sm">{selectedIds.size} selected</span>
            <span className="text-indigo-200 text-sm hidden sm:inline">— set access to</span>
            <select value={bulkRole} onChange={e => setBulkRole(e.target.value)}
              className="text-sm rounded-lg px-2.5 py-1.5 text-foreground outline-none focus:ring-2 focus:ring-white">
              <option value="">Choose account type…</option>
              {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_META[r].label}</option>)}
            </select>
            <button onClick={() => changeRole.mutate({ userIds: [...selectedIds], role: bulkRole })}
              disabled={!bulkRole || changeRole.isPending}
              className="inline-flex items-center gap-1.5 bg-card text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 text-sm font-semibold px-3.5 py-1.5 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed transition">
              {changeRole.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Apply
            </button>
            <button onClick={() => { setSelectedIds(new Set()); setBulkRole(""); }}
              className="text-indigo-100 hover:text-white text-sm">Clear</button>
            {changeRole.isError && <span className="text-red-100 text-xs w-full">Could not update access. Please try again.</span>}
          </div>
        )}

        {/* Table */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted border-b border-border">
                  {canAssign && (
                    <th className="px-4 py-3.5 w-10">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll}
                        aria-label="Select all"
                        className="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500 align-middle" />
                    </th>
                  )}
                  {["Login ID", "Employee ID", "Role", "Status", "Last login", ""].map((h, i) => (
                    <th key={i} className={`px-4 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${i === 5 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={canAssign ? 7 : 6} className="py-16 text-center text-muted-foreground"><Loader2 size={24} className="animate-spin mx-auto" /></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={canAssign ? 7 : 6} className="py-16 text-center text-muted-foreground text-sm">No accounts found</td></tr>
                ) : (
                  rows.map(a => {
                    const st = statusOf(a);
                    return (
                      <tr key={a.id} className={`hover:bg-blue-50/30 transition-colors ${selectedIds.has(a.id) ? "bg-indigo-50 dark:bg-indigo-500/15/40" : ""}`}>
                        {canAssign && (
                          <td className="px-4 py-3.5">
                            <input type="checkbox"
                              checked={selectedIds.has(a.id)}
                              disabled={a.role === "super_admin"}
                              onChange={() => toggleOne(a.id)}
                              aria-label={`Select ${a.email}`}
                              className="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500 disabled:opacity-30 align-middle" />
                          </td>
                        )}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <Mail size={13} className="text-muted-foreground/60 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate">{a.email}</p>
                              <p className="text-xs text-muted-foreground truncate">{a.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {a.employee_id
                            ? <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded"><Hash size={10} />{a.employee_id}</span>
                            : <span className="text-muted-foreground/60 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_CLS[a.role] ?? "bg-muted text-muted-foreground"}`}>
                            {a.role.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${st.cls}`}>{st.label}</span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground">
                          {a.last_login_at ? format(new Date(a.last_login_at), "d MMM yyyy, HH:mm") : <span className="text-muted-foreground/60">never</span>}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {a.role === "super_admin" && !isSuperAdmin ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Only a Super Admin can reset a Super Admin password">
                              <ShieldCheck size={12} /> Protected
                            </span>
                          ) : (
                            <button onClick={() => setResetting(a)}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 dark:border-blue-500/30 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition">
                              <KeyRound size={12} /> Reset password
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
