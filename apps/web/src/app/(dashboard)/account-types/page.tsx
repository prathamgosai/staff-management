"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import {
  UserCog, ShieldCheck, Loader2, Save, RotateCcw, Check, Users, Lock, AlertCircle,
} from "lucide-react";

/* ─── types (mirror GET /roles) ───────────────────────────────────────── */
interface PermissionDef { key: string; label: string; description?: string }
interface PermissionModule { key: string; label: string; permissions: PermissionDef[] }
interface RoleRow {
  role: string;
  label: string;
  description: string;
  hierarchy: number;
  userCount: number;
  editable: boolean;
  permissions: string[];
}
interface RolesResponse { data: { catalog: PermissionModule[]; roles: RoleRow[] } }
interface RoleUser { id: string; name: string; email: string; is_active: boolean; employee_id: string | null }

const ROLE_ACCENT: Record<string, string> = {
  super_admin: "bg-red-500",
  admin: "bg-purple-500",
  hr: "bg-indigo-500",
  head_of_house: "bg-blue-500",
  chef: "bg-cyan-500",
  employee: "bg-gray-400",
};

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && new Set(a).size === new Set([...a, ...b]).size;

/* ─── page ────────────────────────────────────────────────────────────── */
export default function AccountTypesPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = user?.role === "super_admin" || (user?.permissions ?? []).some(p => p === "*" || p === "roles:manage");

  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery<RolesResponse>({
    queryKey: ["roles"],
    queryFn: () => apiClient.get("/roles").then((r) => r.data),
    enabled: !!canManage,
    staleTime: 15_000,
  });

  const roles = useMemo(() => data?.data?.roles ?? [], [data]);
  const catalog = data?.data?.catalog ?? [];

  const [selected, setSelected] = useState<string | null>(null);
  // Unsaved edits, keyed by role, so switching account types doesn't lose them.
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [savedRole, setSavedRole] = useState<string | null>(null);

  // Default to the highest-ranked editable account type once data arrives.
  useEffect(() => {
    if (!selected && roles.length) {
      setSelected(roles.find((r) => r.editable)?.role ?? roles[0].role);
    }
  }, [roles, selected]);

  const current = roles.find((r) => r.role === selected) ?? null;
  const serverPerms = current?.permissions ?? [];
  const draft: string[] = (selected ? drafts[selected] : undefined) ?? serverPerms;
  const dirty = !!current?.editable && !sameSet(draft, serverPerms);

  const setDraft = (next: string[]) => {
    if (!selected) return;
    setDrafts((d) => ({ ...d, [selected]: next }));
    setSavedRole(null);
  };
  const toggle = (key: string) =>
    setDraft(draft.includes(key) ? draft.filter((p) => p !== key) : [...draft, key]);
  const setModule = (mod: PermissionModule, on: boolean) => {
    const keys = mod.permissions.map((p) => p.key);
    setDraft(on ? [...new Set([...draft, ...keys])] : draft.filter((p) => !keys.includes(p)));
  };
  const resetDraft = () => {
    if (!selected) return;
    setDrafts((d) => { const n = { ...d }; delete n[selected]; return n; });
  };

  const save = useMutation({
    mutationFn: () => apiClient.put(`/roles/${selected}/permissions`, { permissions: draft }),
    onSuccess: () => {
      const role = selected;
      qc.invalidateQueries({ queryKey: ["roles"] });
      if (role) setDrafts((d) => { const n = { ...d }; delete n[role]; return n; });
      setSavedRole(role);
    },
  });

  // The users who currently hold the selected account type (fetched on demand).
  const { data: usersRes, isLoading: usersLoading } = useQuery<{ data: RoleUser[] }>({
    queryKey: ["role-users", selected],
    queryFn: () => apiClient.get(`/roles/${selected}/users`).then((r) => r.data),
    enabled: !!canManage && !!selected,
    staleTime: 15_000,
  });
  const users = usersRes?.data ?? [];

  /* ─── access gate ──────────────────────────────────────────────────── */
  if (!canManage) {
    return (
      <div className="max-w-md mx-auto text-center py-24">
        <div className="w-14 h-14 bg-red-50 dark:bg-red-500/15 rounded-full flex items-center justify-center mx-auto mb-3">
          <ShieldCheck size={26} strokeWidth={1.5} className="text-red-400" />
        </div>
        <p className="font-bold text-foreground">Restricted area</p>
        <p className="text-sm text-muted-foreground mt-1">You need the “Manage account types” permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-500/20 rounded-xl flex items-center justify-center">
          <UserCog size={20} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Account Types &amp; Permissions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Choose what each type of account is allowed to do.</p>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 dark:bg-blue-500/15 border border-blue-100 dark:border-blue-500/30 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-300 flex gap-2 items-start">
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
        <span>
          Turn permissions on or off for an account type, then <b>Save changes</b>. Updates apply the next time
          each affected user makes a request. <b>Super Admin</b> always keeps full access and can’t be edited.
        </span>
      </div>

      {isLoading ? (
        <div className="bg-card rounded-2xl border border-border p-16 text-center">
          <Loader2 size={24} className="animate-spin mx-auto text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center text-sm text-red-500">
          Could not load account types. Please refresh and try again.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">
          {/* ─── Account type list ─────────────────────────────────────── */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-wide">
              Account Types
            </div>
            <div className="divide-y divide-border">
              {roles.map((r) => {
                const isSel = r.role === selected;
                const count = r.editable ? ((drafts[r.role] ?? r.permissions).length) : null;
                return (
                  <button
                    key={r.role}
                    onClick={() => setSelected(r.role)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition ${isSel ? "bg-blue-50 dark:bg-blue-500/15" : "hover:bg-muted"}`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ROLE_ACCENT[r.role] ?? "bg-border"}`} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-sm truncate">{r.label}</span>
                        {drafts[r.role] && !sameSet(drafts[r.role], r.permissions) && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Unsaved changes" />
                        )}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <Users size={11} /> {r.userCount} {r.userCount === 1 ? "user" : "users"}
                        <span className="text-muted-foreground/60">·</span>
                        {r.editable ? `${count} permissions` : "Full access"}
                      </span>
                    </span>
                    {!r.editable && <Lock size={13} className="text-muted-foreground/60 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ─── Permission editor ─────────────────────────────────────── */}
          {current && (
            <div className="space-y-5">
            {/* Users with this account type */}
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
                <Users size={15} className="text-muted-foreground" />
                <span className="font-semibold text-sm text-foreground">Users with this account type</span>
                <span className="ml-auto text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{current.userCount}</span>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                {usersLoading ? (
                  <div className="py-8 text-center"><Loader2 size={18} className="animate-spin mx-auto text-muted-foreground" /></div>
                ) : users.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No users have this account type yet.</p>
                ) : users.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className={`w-8 h-8 rounded-full ${ROLE_ACCENT[current.role] ?? "bg-border"} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                      {(u.name || u.email).split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{u.name || u.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}{u.employee_id ? ` · #${u.employee_id}` : ""}</p>
                    </div>
                    {!u.is_active && <span className="ml-auto text-[11px] text-muted-foreground shrink-0">inactive</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Permission editor */}
            <div className="bg-card rounded-2xl border border-border shadow-sm">
              {/* Editor header */}
              <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${ROLE_ACCENT[current.role] ?? "bg-border"}`} />
                    <h2 className="font-bold text-foreground">{current.label}</h2>
                    {!current.editable && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        <Lock size={11} /> Locked
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xl">{current.description}</p>
                </div>
                {current.editable && (
                  <div className="flex items-center gap-2">
                    {savedRole === current.role && !dirty && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                        <Check size={14} /> Saved
                      </span>
                    )}
                    <button
                      onClick={resetDraft}
                      disabled={!dirty || save.isPending}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground border border-border hover:bg-muted px-3 py-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      <RotateCcw size={14} /> Reset
                    </button>
                    <button
                      onClick={() => save.mutate()}
                      disabled={!dirty || save.isPending}
                      className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Save changes
                    </button>
                  </div>
                )}
              </div>

              {save.isError && (
                <div className="mx-5 mt-4 text-xs text-red-600 bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">
                  Could not save. Please try again.
                </div>
              )}

              {/* Permission modules */}
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                {catalog.map((mod) => {
                  const keys = mod.permissions.map((p) => p.key);
                  const activeCount = keys.filter((k) => draft.includes(k)).length;
                  const allOn = activeCount === keys.length;
                  return (
                    <div key={mod.key} className="border border-border rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-muted border-b border-border">
                        <span className="font-semibold text-sm text-foreground">{mod.label}</span>
                        {current.editable ? (
                          <button
                            onClick={() => setModule(mod, !allOn)}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                          >
                            {allOn ? "Clear all" : "Select all"}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">{activeCount}/{keys.length}</span>
                        )}
                      </div>
                      <div className="divide-y divide-gray-50">
                        {mod.permissions.map((p) => {
                          const on = draft.includes(p.key);
                          return (
                            <label
                              key={p.key}
                              className={`flex items-start gap-3 px-4 py-2.5 ${current.editable ? "cursor-pointer hover:bg-muted" : "opacity-70"} transition`}
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={!current.editable || save.isPending}
                                onChange={() => toggle(p.key)}
                                className="mt-0.5 h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500 disabled:opacity-60"
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-foreground">{p.label}</span>
                                {p.description && <span className="block text-xs text-muted-foreground">{p.description}</span>}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
