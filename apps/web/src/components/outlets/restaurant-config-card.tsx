"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { Building2, Sliders, Save, Loader2, History, Wand2, X } from "lucide-react";
import { format } from "date-fns";

interface Category { id: string; name: string; }
interface ConfigResponse {
  outletId: string; seatingCapacity: number | null; totalTables: number | null; maxPax: number | null;
  configuration: null | {
    categoryId: string | null; categoryName: string | null;
    areaSqft: number | null; kitchenSizeSqft: number | null; avgDailyPax: number | null; peakPax: number | null;
    lunchCapacity: number | null; dinnerCapacity: number | null; updatedAt: string | null;
  };
}
interface RatioRow { positionId: string; positionName: string; guestsPerStaff: number | null; minStaff: number | null; }
interface HistoryRow { id: string; positionName: string; oldGuestsPerStaff: number | null; newGuestsPerStaff: number; oldMinStaff: number | null; newMinStaff: number; changedByName: string | null; changedAt: string; }

const CONFIG_FIELDS: { key: string; label: string }[] = [
  { key: "areaSqft", label: "Area (sq ft)" },
  { key: "kitchenSizeSqft", label: "Kitchen size (sq ft)" },
  { key: "avgDailyPax", label: "Avg daily pax" },
  { key: "peakPax", label: "Peak pax" },
  { key: "lunchCapacity", label: "Lunch capacity" },
  { key: "dinnerCapacity", label: "Dinner capacity" },
];

export function RestaurantConfigCard({ outletId }: { outletId: string }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canView = hasPermission(user, "allocation:read");
  const canEdit = hasPermission(user, "staffing:ratios");
  const [showHistory, setShowHistory] = useState(false);

  const cfgQ = useQuery<{ data: ConfigResponse }>({
    queryKey: ["restaurant-config", outletId],
    queryFn: () => apiClient.get(`/outlets/${outletId}/configuration`).then((r) => r.data),
    staleTime: 30_000, enabled: canView,
  });
  const ratiosQ = useQuery<{ data: RatioRow[] }>({
    queryKey: ["restaurant-ratios", outletId],
    queryFn: () => apiClient.get(`/outlets/${outletId}/staffing-ratios`).then((r) => r.data),
    staleTime: 30_000, enabled: canView,
  });
  const catsQ = useQuery<{ data: Category[] }>({
    queryKey: ["restaurant-categories"],
    queryFn: () => apiClient.get("/settings/restaurant-categories").then((r) => r.data),
    staleTime: 300_000, enabled: canView,
  });

  // Local editable state
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [categoryId, setCategoryId] = useState("");
  const [rows, setRows] = useState<Record<string, { g: string; m: string }>>({});
  useEffect(() => {
    const c = cfgQ.data?.data.configuration;
    if (cfgQ.data) {
      setCfg({
        areaSqft: c?.areaSqft?.toString() ?? "", kitchenSizeSqft: c?.kitchenSizeSqft?.toString() ?? "",
        avgDailyPax: c?.avgDailyPax?.toString() ?? "", peakPax: c?.peakPax?.toString() ?? "",
        lunchCapacity: c?.lunchCapacity?.toString() ?? "", dinnerCapacity: c?.dinnerCapacity?.toString() ?? "",
      });
      setCategoryId(c?.categoryId ?? "");
    }
  }, [cfgQ.data]);
  useEffect(() => {
    if (ratiosQ.data) {
      const m: Record<string, { g: string; m: string }> = {};
      for (const r of ratiosQ.data.data) m[r.positionId] = { g: r.guestsPerStaff?.toString() ?? "", m: r.minStaff?.toString() ?? "" };
      setRows(m);
    }
  }, [ratiosQ.data]);

  const saveConfig = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { categoryId: categoryId || undefined };
      for (const f of CONFIG_FIELDS) { const v = cfg[f.key]; if (v !== "" && v != null) body[f.key] = Number(v); }
      return apiClient.put(`/outlets/${outletId}/configuration`, body);
    },
    onSuccess: () => { toast.success("Configuration saved."); qc.invalidateQueries({ queryKey: ["restaurant-config", outletId] }); },
    onError: (e) => toast.error(msg(e, "Could not save configuration.")),
  });

  const saveRatios = useMutation({
    mutationFn: () => {
      const ratios = Object.entries(rows)
        .filter(([, v]) => v.g !== "" && Number(v.g) > 0)
        .map(([positionId, v]) => ({ positionId, guestsPerStaff: Number(v.g), minStaff: Number(v.m || "0") }));
      if (ratios.length === 0) throw new Error("Set at least one role's guests-per-staff.");
      return apiClient.put(`/outlets/${outletId}/staffing-ratios`, { ratios });
    },
    onSuccess: () => {
      toast.success("Ratios saved.");
      qc.invalidateQueries({ queryKey: ["restaurant-ratios", outletId] });
      qc.invalidateQueries({ queryKey: ["ratio-history", outletId] });
    },
    onError: (e) => toast.error(msg(e, "Could not save ratios.")),
  });

  const applyTemplate = useMutation({
    mutationFn: () => {
      if (!categoryId) throw new Error("Pick a restaurant category first.");
      return apiClient.post(`/outlets/${outletId}/staffing-ratios/apply-template`, { categoryId });
    },
    onSuccess: () => { toast.success("Prefilled from category template."); qc.invalidateQueries({ queryKey: ["restaurant-ratios", outletId] }); },
    onError: (e) => toast.error(msg(e, "Could not apply template.")),
  });

  const positions = ratiosQ.data?.data ?? [];
  const loading = cfgQ.isLoading || ratiosQ.isLoading;
  const maxPax = cfgQ.data?.data.maxPax ?? null;

  if (!canView) return null;

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Building2 size={15} className="text-muted-foreground" />
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Restaurant configuration</p>
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}</div>
      ) : (
        <>
          {/* Config fields */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Category</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={!canEdit}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring disabled:bg-muted">
                <option value="">— Select —</option>
                {(catsQ.data?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {CONFIG_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">{f.label}</label>
                <input value={cfg[f.key] ?? ""} onChange={(e) => setCfg((s) => ({ ...s, [f.key]: e.target.value.replace(/[^\d]/g, "") }))}
                  disabled={!canEdit} inputMode="numeric"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground" />
              </div>
            ))}
          </div>
          {canEdit && (
            <button onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold px-4 py-2 rounded-xl text-sm transition">
              {saveConfig.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save configuration
            </button>
          )}

          {/* Per-role ratios */}
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5"><Sliders size={13} /> Per-role staffing ratios</p>
              <button onClick={() => setShowHistory(true)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><History size={12} /> History</button>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              Guests per staff — required = <span className="font-semibold text-foreground">max(min, ⌈{maxPax ?? "pax"} ÷ guests/staff⌉)</span>. Blank = role not modelled here.
            </p>

            <div className="rounded-xl border border-border overflow-hidden">
              <div className="grid grid-cols-[1.6fr_1fr_1fr] gap-2 px-3 py-2 bg-muted text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                <span>Role</span><span>Guests / staff</span><span>Min staff</span>
              </div>
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {positions.map((p) => (
                  <div key={p.positionId} className="grid grid-cols-[1.6fr_1fr_1fr] gap-2 items-center px-3 py-2">
                    <span className="text-sm text-foreground truncate">{p.positionName}</span>
                    <input value={rows[p.positionId]?.g ?? ""} disabled={!canEdit}
                      onChange={(e) => setRows((s) => ({ ...s, [p.positionId]: { g: e.target.value.replace(/[^\d.]/g, ""), m: s[p.positionId]?.m ?? "" } }))}
                      inputMode="decimal" placeholder="—"
                      className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring disabled:bg-muted" />
                    <input value={rows[p.positionId]?.m ?? ""} disabled={!canEdit}
                      onChange={(e) => setRows((s) => ({ ...s, [p.positionId]: { g: s[p.positionId]?.g ?? "", m: e.target.value.replace(/[^\d]/g, "") } }))}
                      inputMode="numeric" placeholder="0"
                      className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring disabled:bg-muted" />
                  </div>
                ))}
              </div>
            </div>

            {canEdit && (
              <div className="flex flex-wrap gap-2 mt-3">
                <button onClick={() => saveRatios.mutate()} disabled={saveRatios.isPending}
                  className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold px-4 py-2 rounded-xl text-sm transition">
                  {saveRatios.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save ratios
                </button>
                <button onClick={() => applyTemplate.mutate()} disabled={applyTemplate.isPending || !categoryId}
                  title={categoryId ? "Prefill from the category template / company defaults" : "Pick a category first"}
                  className="inline-flex items-center gap-2 bg-muted hover:bg-border disabled:opacity-50 text-foreground font-semibold px-4 py-2 rounded-xl text-sm transition">
                  {applyTemplate.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Prefill from template
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {showHistory && <RatioHistoryDrawer outletId={outletId} onClose={() => setShowHistory(false)} />}
    </div>
  );
}

function RatioHistoryDrawer({ outletId, onClose }: { outletId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ data: HistoryRow[] }>({
    queryKey: ["ratio-history", outletId],
    queryFn: () => apiClient.get(`/outlets/${outletId}/staffing-ratios/history`).then((r) => r.data),
  });
  const rows = data?.data ?? [];
  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card w-full max-w-sm h-full shadow-2xl p-5 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground flex items-center gap-2"><History size={16} /> Ratio history</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted"><X size={16} /></button>
        </div>
        {isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No changes recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="bg-muted rounded-xl px-3 py-2.5">
                <p className="text-sm font-semibold text-foreground">{r.positionName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {r.oldGuestsPerStaff ?? "—"} → {r.newGuestsPerStaff} guests/staff · min {r.oldMinStaff ?? "—"} → {r.newMinStaff}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{r.changedByName ?? "—"} · {format(new Date(r.changedAt), "d MMM yyyy, HH:mm")}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function msg(e: unknown, fallback: string): string {
  const m = (e as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
  if (Array.isArray(m)) return m.join(", ");
  return m ?? (e as Error).message ?? fallback;
}
