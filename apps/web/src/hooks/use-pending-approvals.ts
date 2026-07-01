"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";

/**
 * Pending staff-registration count for the sidebar/top-bar badge. Only account
 * managers may read it (others get 403). react-query dedupes the shared key, so
 * the sidebar and top-bar together trigger just one poll.
 */
export function usePendingApprovals(): number {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const canManage = hasPermission(user, "accounts:manage");

  const { data } = useQuery<{ data: unknown[] }>({
    queryKey: ["pending-registrations"],
    queryFn: () => apiClient.get("/auth/pending-registrations").then((r) => r.data),
    refetchInterval: 30_000,
    staleTime: 0,
    enabled: !!accessToken && canManage,
  });

  return data?.data?.length ?? 0;
}
