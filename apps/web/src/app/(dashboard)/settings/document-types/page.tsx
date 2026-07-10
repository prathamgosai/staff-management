"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { FileText, Loader2, Plus, Trash2, Check } from "lucide-react";

interface DocType {
  id: string; key: string; name: string;
  isMandatory: boolean; requiresNumber: boolean; requiresExpiry: boolean; isActive: boolean;
}

export default function DocumentTypesPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canEdit = hasPermission(user, "staff:documents");
  const [newName, setNewName] = useState("");

  const { data, isLoading } = useQuery<{ data: DocType[] }>({
    queryKey: ["document-types"],
    queryFn: () => apiClient.get("/settings/document-types").then((r) => r.data),
    staleTime: 60_000,
  });
  const types = data?.data ?? [];

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<DocType> }) => apiClient.put(`/settings/document-types/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["document-types"] }),
    onError: () => toast.error("Could not update type."),
  });
  const add = useMutation({
    mutationFn: (name: string) => apiClient.post("/settings/document-types", { name }),
    onSuccess: () => { toast.success("Type added."); setNewName(""); qc.invalidateQueries({ queryKey: ["document-types"] }); },
    onError: (e) => {
      const m = (e as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(", ") : m ?? "Could not add type.");
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/settings/document-types/${id}`),
    onSuccess: () => { toast.success("Type removed."); qc.invalidateQueries({ queryKey: ["document-types"] }); },
    onError: (e) => {
      const m = (e as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(", ") : m ?? "Could not remove type.");
    },
  });

  function toggle(t: DocType, field: "isMandatory" | "requiresNumber" | "requiresExpiry" | "isActive") {
    patch.mutate({ id: t.id, body: { [field]: !t[field] } });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><FileText size={18} /></div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Document types</h1>
          <p className="text-sm text-muted-foreground">Define the document types HR can upload, and which are mandatory.</p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1.6fr_repeat(4,0.7fr)_auto] gap-2 px-5 py-3 bg-muted border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
          <span>Type</span><span className="text-center">Mandatory</span><span className="text-center">Number</span>
          <span className="text-center">Expiry</span><span className="text-center">Active</span><span />
        </div>
        {isLoading ? (
          <div className="p-5 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}</div>
        ) : types.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No document types. Apply migration 019 to seed the defaults.</p>
        ) : (
          <div className="divide-y divide-border">
            {types.map((t) => (
              <div key={t.id} className="grid grid-cols-[1.6fr_repeat(4,0.7fr)_auto] gap-2 items-center px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{t.name}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">{t.key}</p>
                </div>
                <Toggle on={t.isMandatory} disabled={!canEdit} onClick={() => toggle(t, "isMandatory")} />
                <Toggle on={t.requiresNumber} disabled={!canEdit} onClick={() => toggle(t, "requiresNumber")} />
                <Toggle on={t.requiresExpiry} disabled={!canEdit} onClick={() => toggle(t, "requiresExpiry")} />
                <Toggle on={t.isActive} disabled={!canEdit} onClick={() => toggle(t, "isActive")} />
                <button onClick={() => { if (canEdit && confirm(`Remove "${t.name}"?`)) del.mutate(t.id); }}
                  disabled={!canEdit} title="Remove"
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-30 justify-self-end">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <div className="bg-card rounded-2xl border border-border shadow-sm p-5 flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Add a document type</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} placeholder="e.g. ESIC Card"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <button onClick={() => newName.trim() && add.mutate(newName.trim())} disabled={add.isPending || !newName.trim()}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold px-4 py-2.5 rounded-xl text-sm transition">
            {add.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add
          </button>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, disabled, onClick }: { on: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`mx-auto w-8 h-8 rounded-lg flex items-center justify-center transition disabled:cursor-default ${on ? "bg-success/15 text-success" : "bg-muted text-muted-foreground/40"}`}>
      {on ? <Check size={15} /> : <span className="w-3 h-0.5 bg-current rounded-full" />}
    </button>
  );
}
