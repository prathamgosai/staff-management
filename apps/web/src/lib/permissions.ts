import type { AuthUser } from "@workforceiq/shared";

/**
 * True if the user may perform an action. super_admin (or the "*" wildcard)
 * always passes; otherwise the user must hold the specific permission.
 * Mirrors the server-side PermissionsGuard so UI gating and API gating agree.
 */
export function hasPermission(user: AuthUser | null | undefined, perm: string): boolean {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  const perms = user.permissions ?? [];
  return perms.includes("*") || perms.includes(perm);
}
