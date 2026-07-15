"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { Wand2, Loader2, Save, Info } from "lucide-react";

interface Category { id: string; name: string; }
interface Position { id: string; name: string; level?: number; }
interface Template { positionId: string; guestsPerStaff: number; minStaff: number; }

export default function RatioTemplatesPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canView = hasPermission(user, "allocation:read");
  const canEdit = hasPermission(user, "staffing:ratios");
  const [categoryId, setCategoryId] = useState("");

  const cats = useQuery<{ data: Category[] }>({
    queryKey: ["restaurant-categories"],
    queryFn: () => apiClient.get("/settings/restaurant-categories").then((r) => r.data),
    staleTime: 300_000, enabled: canView,
  });
  const positions = useQuery<{ data: Position[] }>({
    queryKey: ["positions"],
    queryFn: () => apiClient.get("/departments/positions").then((r) => r.data),
    staleTime: 300_000, enabled: canView,
  });
  const templates = useQuery<{ data: Template[] }>({
    queryKey: ["ratio-templates", categoryId],
    queryFn: () => apiClient.get("/settings/ratio-templates", { params: { categoryId } }).then((r) => r.data),
    enabled: canView && !!categoryId,
  });

  useEffect(() => {
    if (!categoryId && cats.data?.data?.length) setCategoryId(cats.data.data[0].id);
  }, [cats.data, categoryId]);

  const [rows, setRows] = useState<Record<string, { g: string; m: string }>>({});
  useEffect(() => {
    const m: Record<string, { g: string; m: string }> = {};
    for (const t of templates.data?.data ?? []) m[t.positionId] = { g: String(t.guestsPerStaff), m: String(t.minStaff) };
    setRows(m);
  }, [templates.data]);

  const save = useMutation({
    mutationFn: () => {
      const out = Object.entries(rows)
        .filter(([, v]) => v.g !== "" && Number(v.g) > 0)
        .map(([positionId, v]) => ({ positionId, guestsPerStaff: Number(v.g), minStaff: Number(v.m || "0") }));
      if (out.length === 0) throw new Error("Set at least one role's guests-per-staff.");
      return apiClient.put("/settings/ratio-templates", { categoryId, rows: out });
    },
    onSuccess: () => { toast.success("Template saved."); qc.invalidateQueries({ queryKey: ["ratio-templates", categoryId] }); },
    onError: (e) => {
      const m = (e as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(", ") : m ?? (e as Error).message ?? "Could not save.");
    },
  });

  if (!canView) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Wand2 size={18} /></div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Ratio templates</h1>
          <p className="text-sm text-muted-foreground">Per-category defaults used to prefill a new outlet’s staffing ratios.</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
        <Info size={14} className="mt-0.5 shrink-0" />
        <p>When you “Prefill from template” on an outlet, roles not covered here fall back to the company category defaults.</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Restaurant category</label>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
          className="w-full max-w-xs border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring">
          {(cats.data?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1.6fr_1fr_1fr] gap-2 px-5 py-3 bg-muted border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
          <span>Role</span><span>Guests / staff</span><span>Min staff</span>
        </div>
        {positions.isLoading ? (
          <div className="p-5 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 bg-muted rounded-lg animate-pulse" />)}</div>
        ) : (
          <div className="divide-y divide-border max-h-[28rem] overflow-y-auto">
            {(positions.data?.data ?? []).map((p) => (
              <div key={p.id} className="grid grid-cols-[1.6fr_1fr_1fr] gap-2 items-center px-5 py-2.5">
                <span className="text-sm text-foreground truncate">{p.name}</span>
                <input value={rows[p.id]?.g ?? ""} disabled={!canEdit}
                  onChange={(e) => setRows((s) => ({ ...s, [p.id]: { g: e.target.value.replace(/[^\d.]/g, ""), m: s[p.id]?.m ?? "" } }))}
                  inputMode="decimal" placeholder="—"
                  className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring disabled:bg-muted" />
                <input value={rows[p.id]?.m ?? ""} disabled={!canEdit}
                  onChange={(e) => setRows((s) => ({ ...s, [p.id]: { g: s[p.id]?.g ?? "", m: e.target.value.replace(/[^\d]/g, "") } }))}
                  inputMode="numeric" placeholder="0"
                  className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring disabled:bg-muted" />
              </div>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <button onClick={() => save.mutate()} disabled={save.isPending || !categoryId}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold px-5 py-2.5 rounded-xl text-sm transition">
          {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save template
        </button>
      )}
    </div>
  );
}
