"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { FileText, CalendarClock, AlertTriangle, ChevronRight } from "lucide-react";

interface Widgets {
  expiringIn30Days: number;
  employeesMissingMandatory: number;
  recentlyUploaded: { id: string }[];
}

/**
 * Compact document-compliance widget for the main dashboard. Self-hides when the caller lacks
 * documents:status or the endpoint errors (mirrors ForecastStrip).
 */
export function DocumentsWidget() {
  const user = useAuthStore((s) => s.user);
  const allowed = hasPermission(user, "documents:status");

  const { data, isError } = useQuery<{ data: Widgets }>({
    queryKey: ["document-widgets"],
    queryFn: () => apiClient.get("/documents/widgets").then((r) => r.data),
    staleTime: 60_000, enabled: allowed, retry: false,
  });

  if (!allowed || isError || !data) return null;
  const w = data.data;

  return (
    <Link href="/documents" className="block bg-card rounded-2xl border border-border shadow-sm p-5 hover:border-primary/40 transition group">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
          <FileText size={13} /> Documents
        </p>
        <ChevronRight size={15} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/50 px-3 py-2.5">
          <p className="text-2xl font-black text-warning">{w.expiringIn30Days}</p>
          <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><CalendarClock size={11} /> Expiring in 30d</p>
        </div>
        <div className="rounded-xl bg-muted/50 px-3 py-2.5">
          <p className={`text-2xl font-black ${w.employeesMissingMandatory > 0 ? "text-destructive" : "text-foreground"}`}>{w.employeesMissingMandatory}</p>
          <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><AlertTriangle size={11} /> Missing mandatory</p>
        </div>
      </div>
    </Link>
  );
}
