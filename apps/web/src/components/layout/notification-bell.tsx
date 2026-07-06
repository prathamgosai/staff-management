"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  useUnreadCount, useNotifications, useNotificationActions, notificationHref,
  type NotificationItem,
} from "@/hooks/use-notifications";
import { notificationVisual } from "@/components/notifications/notification-meta";

function timeAgo(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

/**
 * Header bell: unread-count badge + a Radix dropdown of recent notifications.
 * Clicking an item marks it read and deep-links to its subject; "Mark all read"
 * clears the badge. Full history lives at /notifications.
 */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const unread = useUnreadCount();
  const { data } = useNotifications(1, 8);
  const items = data?.data?.items ?? [];
  const { markRead, markAllRead } = useNotificationActions();

  function openItem(n: NotificationItem) {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
    router.push(notificationHref(n));
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-danger text-[9px] font-bold text-danger-foreground ring-2 ring-surface">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(92vw,22rem)] p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto border-t border-border">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</div>
          ) : (
            items.map((n) => {
              const { Icon, chip } = notificationVisual(n.type);
              return (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition hover:bg-muted ${n.readAt ? "" : "bg-primary/5"}`}
                >
                  <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${chip}`}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">{n.title}</span>
                      {!n.readAt && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                    </span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground/70">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-border">
          <button
            onClick={() => {
              setOpen(false);
              router.push("/notifications");
            }}
            className="w-full px-3 py-2.5 text-center text-sm font-medium text-primary transition hover:bg-muted"
          >
            View all notifications
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
