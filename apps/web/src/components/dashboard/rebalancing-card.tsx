"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { ArrowLeftRight, CheckCircle2 } from "lucide-react";

interface Suggestion {
  category: string; count: number;
  from: string; to: string; fromOutletId: string; toOutletId: string; text: string;
}

/** Advisory cross-outlet rebalancing (from the capacity variance). Self-hides w/o perm or on error. */
export function RebalancingCard() {
  const user = useAuthStore((s) => s.user);
  const canView = hasPermission(user, "allocation:read");

  const { data, isLoading, isError } = useQuery<{ data: { suggestions: Suggestion[] } }>({
    queryKey: ["rebalancing-suggestions"],
    queryFn: () => apiClient.get("/outlets/rebalancing-suggestions").then((r) => r.data),
    staleTime: 60_000,
    enabled: canView,
    retry: false,
  });

  if (!canView || isError) return null; // hidden before capacity model is set up
  if (isLoading) return <div className="h-28 bg-muted rounded-2xl animate-pulse" />;

  const suggestions = data?.data?.suggestions ?? [];

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <ArrowLeftRight size={16} className="text-muted-foreground" />
        <h3 className="font-bold text-foreground">Suggested rebalancing</h3>
        <span className="text-xs text-muted-foreground">· advisory</span>
      </div>
      {suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
          <CheckCircle2 size={14} className="text-emerald-600" /> Staffing is balanced ✅
        </p>
      ) : (
        <ul className="space-y-2">
          {suggestions.map((s, i) => (
            <li key={i} className="flex items-center gap-2.5 bg-muted rounded-xl px-4 py-2.5 text-sm flex-wrap">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-card border border-border text-muted-foreground">{s.category}</span>
              <span className="text-foreground">Move <b>{s.count}</b></span>
              <Link href={`/outlets/${s.fromOutletId}`} className="font-medium text-foreground hover:text-blue-600">{s.from}</Link>
              <ArrowLeftRight size={12} className="text-muted-foreground" />
              <Link href={`/outlets/${s.toOutletId}`} className="font-medium text-foreground hover:text-blue-600">{s.to}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
