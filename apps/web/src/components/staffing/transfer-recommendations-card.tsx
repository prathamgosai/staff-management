"use client";

import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { ArrowLeftRight, Loader2, RefreshCw, Check, X } from "lucide-react";

interface Rec {
  id: string; fromName: string; toName: string; positionName: string;
  headcount: number; confidence: "high" | "medium" | "low"; reason: string; status: string;
}
const CONFIDENCE: Record<string, string> = {
  high: "bg-success/15 text-success",
  medium: "bg-warning/15 text-warning",
  low: "bg-muted text-muted-foreground",
};

/** Cross-outlet transfer recommendations (Feature 6). Self-hides without allocation:read. */
export function TransferRecommendationsCard() {
  const qc = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const canView = hasPermission(user, "allocation:read");
  const canAct = hasPermission(user, "allocation:write");

  const { data, isLoading, isError } = useQuery<{ data: Rec[] }>({
    queryKey: ["transfer-recommendations", "pending"],
    queryFn: () => apiClient.get("/transfer-recommendations", { params: { status: "pending" } }).then((r) => r.data),
    staleTime: 30_000, enabled: canView, retry: false,
  });

  const regen = useMutation({
    mutationFn: () => apiClient.post("/transfer-recommendations/regenerate"),
    onSuccess: (r: { data: { data: { generated: number; created: number } } }) => {
      toast.success(`Generated ${r.data.data.created} new recommendation(s).`);
      qc.invalidateQueries({ queryKey: ["transfer-recommendations", "pending"] });
    },
    onError: () => toast.error("Could not regenerate recommendations."),
  });
  const accept = useMutation({
    mutationFn: (id: string) => apiClient.post(`/transfer-recommendations/${id}/accept`).then((r) => r.data),
    onSuccess: (r: { data: { deepLink: { path: string } } }) => {
      toast.success("Accepted — opening the transfer form.");
      qc.invalidateQueries({ queryKey: ["transfer-recommendations", "pending"] });
      router.push(r.data.deepLink?.path ?? "/allocation");
    },
    onError: () => toast.error("Could not accept the recommendation."),
  });
  const reject = useMutation({
    mutationFn: (id: string) => apiClient.post(`/transfer-recommendations/${id}/reject`),
    onSuccess: () => { toast.success("Rejected."); qc.invalidateQueries({ queryKey: ["transfer-recommendations", "pending"] }); },
    onError: () => toast.error("Could not reject the recommendation."),
  });

  if (!canView || isError) return null;
  const recs = data?.data ?? [];

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
          <ArrowLeftRight size={13} /> Transfer recommendations
        </p>
        <button onClick={() => regen.mutate()} disabled={regen.isPending}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          {regen.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Regenerate
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : recs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No pending recommendations — staffing looks balanced. ✅</p>
      ) : (
        <div className="space-y-2">
          {recs.map((r) => (
            <div key={r.id} className="rounded-xl bg-muted/50 px-4 py-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span>{r.fromName}</span>
                  <ArrowLeftRight size={13} className="text-muted-foreground" />
                  <span>{r.toName}</span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-card border border-border text-muted-foreground">
                    {r.headcount}× {r.positionName}
                  </span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CONFIDENCE[r.confidence]}`}>{r.confidence}</span>
                </div>
                {canAct && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => accept.mutate(r.id)} disabled={accept.isPending} title="Accept & open transfer"
                      className="p-1.5 rounded-lg hover:bg-success/15 text-muted-foreground hover:text-success"><Check size={15} /></button>
                    <button onClick={() => reject.mutate(r.id)} disabled={reject.isPending} title="Reject"
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><X size={15} /></button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{r.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
