import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

/**
 * Is this login linked to a staff record?
 *
 * GET /me returns the caller's own staff profile and 404s ("No staff profile is linked to
 * your account") when there isn't one — which is the normal state for System Admin and other
 * office logins. That 404 IS the answer, so it is not retried or surfaced as an error.
 *
 * Resolved from the existing endpoint rather than by adding staffId to the JWT: that would
 * cost a database lookup on every single authenticated request, and this answer changes at
 * most when someone is hired.
 */
export function useHasStaffProfile(): { hasStaffProfile: boolean; isResolved: boolean } {
  const { data, isError, isLoading } = useQuery({
    queryKey: ["me-profile"],
    queryFn: () => apiClient.get("/me").then((r) => r.data),
    staleTime: Infinity,
    retry: false, // a 404 here is a fact about the account, not a transient failure
  });

  return { hasStaffProfile: !!data && !isError, isResolved: !isLoading };
}
