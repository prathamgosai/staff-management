"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { Sliders, Loader2, Save, Info } from "lucide-react";

interface Ratio { id: string; category: string; paxPerStaff: number; minStaff: number; }
interface RatiosResponse { ratios: Ratio[]; coversPerOnDutyStaff: number; }
interface EditRow { category: string; paxPerStaff: string; minStaff: string; }

export default function StaffingRatiosPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canEdit = hasPermission(user, "roles:manage");

  const { data, isLoading } = useQuery<{ data: RatiosResponse }>({
    queryKey: ["staffing-ratios"],
    queryFn: () => apiClient.get("/settings/staffing-ratios").then((r) => r.data),
    staleTime: 30_000,
  });

  const [rows, setRows] = useState<EditRow[]>([]);
  const [covers, setCovers] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (data?.data) {
      setRows(data.data.ratios.map((r) => ({ category: r.category, paxPerStaff: String(r.paxPerStaff), minStaff: String(r.minStaff) })));
      setCovers(String(data.data.coversPerOnDutyStaff));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: (payload: { ratios: { category: string; paxPerStaff: number; minStaff: number }[]; coversPerOnDutyStaff: number }) =>
      apiClient.put("/settings/staffing-ratios", payload),
    onSuccess: () => {
      toast.success("Saved.");
      qc.invalidateQueries({ queryKey: ["staffing-ratios"] });
      qc.invalidateQueries({ queryKey: ["capacity-analysis"] });
      setErr(null);
    },
    onError: (e) => {
      const m = (e as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
      setErr(Array.isArray(m) ? m.join(", ") : m ?? "Could not save. Please try again.");
    },
  });

  function setField(category: string, field: "paxPerStaff" | "minStaff", value: string) {
    setRows((rs) => rs.map((r) => (r.category === category ? { ...r, [field]: value } : r)));
  }

  function submit() {
    setErr(null);
    const out: { category: string; paxPerStaff: number; minStaff: number }[] = [];
    for (const r of rows) {
      const pax = parseFloat(r.paxPerStaff);
      const min = parseInt(r.minStaff, 10);
      if (!(pax > 0)) { setErr(`${r.category}: pax per staff must be greater than 0.`); return; }
      if (!Number.isInteger(min) || min < 0) { setErr(`${r.category}: minimum staff must be a whole number ≥ 0.`); return; }
      out.push({ category: r.category, paxPerStaff: pax, minStaff: min });
    }
    const cov = parseFloat(covers);
    if (!(cov > 0)) { setErr("Covers per on-duty staff must be greater than 0."); return; }
    save.mutate({ ratios: out, coversPerOnDutyStaff: cov });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Sliders size={18} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Staffing ratios</h1>
          <p className="text-sm text-muted-foreground">How many staff each category needs per guest (pax).</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
        <Info size={14} className="mt-0.5 shrink-0" />
        <p>
          Required staff per outlet = <span className="font-semibold text-foreground">max(min&nbsp;staff, ⌈max&nbsp;pax ÷ pax&nbsp;per&nbsp;staff⌉)</span>.
          Lower “pax per staff” = more staff. These are heuristics — tune them for your group.
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-3 px-5 py-3 bg-muted border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-widest">
          <span>Category</span>
          <span>Pax / staff</span>
          <span>Min staff</span>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10 px-5">
            No ratios found. Apply migration 017 to seed the category defaults.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.category} className="grid grid-cols-[1.4fr_1fr_1fr] gap-3 items-center px-5 py-3">
                <span className="text-sm font-semibold text-foreground">{r.category}</span>
                <input
                  value={r.paxPerStaff}
                  onChange={(e) => setField(r.category, "paxPerStaff", e.target.value.replace(/[^\d.]/g, ""))}
                  disabled={!canEdit}
                  inputMode="decimal"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-muted disabled:text-muted-foreground"
                />
                <input
                  value={r.minStaff}
                  onChange={(e) => setField(r.category, "minStaff", e.target.value.replace(/[^\d]/g, ""))}
                  disabled={!canEdit}
                  inputMode="numeric"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-muted disabled:text-muted-foreground"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Forecast tuning knob */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
        <p className="text-sm font-semibold text-foreground">Covers served per on-duty staff per day</p>
        <p className="text-xs text-muted-foreground mt-0.5 mb-3">Used by the day-of-week forecast: suggested staff = ⌈forecast pax ÷ this⌉. Tune after your first pax import.</p>
        <input
          value={covers}
          onChange={(e) => setCovers(e.target.value.replace(/[^\d.]/g, ""))}
          disabled={!canEdit}
          inputMode="decimal"
          className="w-40 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-muted disabled:text-muted-foreground"
        />
      </div>

      {err && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">{err}</p>
      )}

      {canEdit && rows.length > 0 && (
        <button
          onClick={submit}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition"
        >
          {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Save
        </button>
      )}
    </div>
  );
}
