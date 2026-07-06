"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  channelsSent: string[];
  readAt: string | null;
  createdAt: string;
}

interface NotificationPage {
  items: NotificationItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const UNREAD_COUNT_KEY = ["notifications-unread-count"];
export const NOTIFICATIONS_LIST_KEY = ["notifications-list"];

/** Unread count for the header bell badge. Polls every 30s; degrades to 0 on error. */
export function useUnreadCount(): number {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { data } = useQuery<{ data: { count: number } }>({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: () => apiClient.get("/notifications/unread-count").then((r) => r.data),
    refetchInterval: 30_000,
    staleTime: 0,
    enabled: !!accessToken,
  });
  return data?.data?.count ?? 0;
}

/** Paginated notifications for the bell dropdown (small limit) and the history page. */
export function useNotifications(page = 1, limit = 20) {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery<{ data: NotificationPage }>({
    queryKey: [...NOTIFICATIONS_LIST_KEY, page, limit],
    queryFn: () => apiClient.get("/notifications", { params: { page, limit } }).then((r) => r.data),
    enabled: !!accessToken,
    staleTime: 0,
  });
}

export function useNotificationActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
    qc.invalidateQueries({ queryKey: NOTIFICATIONS_LIST_KEY });
  };
  const markRead = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/notifications/${id}/read`),
    onSuccess: invalidate,
    // Marking-on-click is a background nicety — don't toast if it fails.
    meta: { silentError: true },
  });
  const markAllRead = useMutation({
    mutationFn: () => apiClient.post("/notifications/read-all"),
    onSuccess: invalidate,
  });
  return { markRead, markAllRead };
}

/** Deep-link a notification to the screen that shows its subject. */
export function notificationHref(n: Pick<NotificationItem, "type">): string {
  switch (n.type) {
    case "roster_published":
    case "shift_changed":
    case "shift_reminder":
      return "/scheduling";
    case "leave_requested":
    case "leave_decided":
      return "/leave";
    case "account_pending_approval":
      return "/approvals";
    default:
      return "/notifications";
  }
}
