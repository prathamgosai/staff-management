"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/auth.store";
import { isAdminRole } from "@workforceiq/shared";
import { IndianRupee, Loader2, Save, Info, ShieldAlert } from "lucide-react";

interface SalaryRow { positionId: string; positionName: string; level?: number; avgMonthlySalary: number | null; }

export default function RoleSalariesPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canEdit = isAdminRole(user?.role);

  const { data, isLoading, isError } = useQuery<{ data: SalaryRow[] }>({
    queryKey: ["role-salaries"],
    queryFn: () => apiClient.get("/settings/role-salaries").then((r) => r.data),
    staleTime: 60_000, enabled: canEdit, retry: false,
  });

  const [rows, setRows] = useState<Record<string, string>>({});
  useEffect(() => {
    const m: Record<string, string> = {};
    for (const r of data?.data ?? []) m[r.positionId] = r.avgMonthlySalary?.toString() ?? "";
    setRows(m);
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const salaries = Object.entries(rows)
        .filter(([, v]) => v !== "" && Number(v) >= 0)
        .map(([positionId, v]) => ({ positionId, avgMonthlySalary: Number(v) }));
      if (salaries.length === 0) throw new Error("Enter at least one salary.");
      return apiClient.put("/settings/role-salaries", { salaries });
    },
    onSuccess: () => { toast.success("Salaries saved."); qc.invalidateQueries({ queryKey: ["role-salaries"] }); },
    onError: (e) => {
      const m = (e as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(", ") : m ?? (e as Error).message ?? "Could not save.");
    },
  });

  if (!canEdit) {
    return (
      <div className="mx-auto max-w-md text-center py-20">
        <ShieldAlert className="mx-auto text-muted-foreground mb-3" size={28} />
        <p className="text-sm text-muted-foreground">Only Admin/HR may manage role salaries.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><IndianRupee size={18} /></div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Role salaries</h1>
          <p className="text-sm text-muted-foreground">Average monthly salary per role — powers the staff predictor’s cost estimates.</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
        <Info size={14} className="mt-0.5 shrink-0" />
        <p>These are HR-managed averages (₹/month) used only for planning estimates — not individual pay.</p>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1.6fr_1fr] gap-3 px-5 py-3 bg-muted border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-widest">
          <span>Role</span><span>Avg monthly salary (₹)</span>
        </div>
        {isLoading ? (
          <div className="p-5 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}</div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground text-center py-10">Could not load roles.</p>
        ) : (
          <div className="divide-y divide-border max-h-[28rem] overflow-y-auto">
            {(data?.data ?? []).map((r) => (
              <div key={r.positionId} className="grid grid-cols-[1.6fr_1fr] gap-3 items-center px-5 py-3">
                <span className="text-sm font-semibold text-foreground truncate">{r.positionName}</span>
                <input value={rows[r.positionId] ?? ""} onChange={(e) => setRows((s) => ({ ...s, [r.positionId]: e.target.value.replace(/[^\d]/g, "") }))}
                  inputMode="numeric" placeholder="—"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring" />
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={() => save.mutate()} disabled={save.isPending}
        className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold px-5 py-2.5 rounded-xl text-sm transition">
        {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save salaries
      </button>
    </div>
  );
}
