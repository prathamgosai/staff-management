"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { ChevronLeft, ChevronRight, CheckCheck, BellOff } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useNotifications, useNotificationActions, notificationHref, type NotificationItem,
} from "@/hooks/use-notifications";
import { notificationVisual } from "@/components/notifications/notification-meta";

function ago(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}
function fullTime(iso: string): string {
  try {
    return format(new Date(iso), "PPpp");
  } catch {
    return "";
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useNotifications(page, 20);
  const { markRead, markAllRead } = useNotificationActions();

  const items = data?.data?.items ?? [];
  const totalPages = data?.data?.totalPages ?? 1;
  const total = data?.data?.total ?? 0;

  function open(n: NotificationItem) {
    if (!n.readAt) markRead.mutate(n.id);
    router.push(notificationHref(n));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{total} total</p>
        </div>
        <button
          onClick={() => markAllRead.mutate(undefined, { onSuccess: () => toast.success("All caught up.") })}
          disabled={markAllRead.isPending}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
        >
          <CheckCheck className="size-4" /> Mark all read
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-16 text-center">
          <BellOff size={34} strokeWidth={1.2} className="mx-auto mb-3 text-muted-foreground/60" />
          <p className="font-semibold text-muted-foreground">No notifications yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Roster, shift and leave updates will appear here.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const { Icon, chip } = notificationVisual(n.type);
            return (
              <li key={n.id}>
                <button
                  onClick={() => open(n)}
                  className={`flex w-full items-start gap-3 rounded-2xl border border-border p-4 text-left transition hover:bg-muted ${n.readAt ? "bg-card" : "bg-primary/5"}`}
                >
                  <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${chip}`}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold text-foreground">{n.title}</span>
                      {!n.readAt && <span className="size-2 shrink-0 rounded-full bg-primary" />}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>
                    <span className="mt-1 block text-xs text-muted-foreground/70" title={fullTime(n.createdAt)}>
                      {ago(n.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft className="size-4" /> Prev
          </button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-40"
          >
            Next <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
