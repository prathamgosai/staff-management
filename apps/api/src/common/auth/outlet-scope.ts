import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Pool } from "pg";
import { isAdminRole, type AuthUser } from "@workforceiq/shared";

/**
 * Server-side outlet scoping. The client is NEVER trusted to say which outlet's
 * data it may see — the allowed set is derived from the authenticated user.
 *
 *   super_admin / admin / hr → every outlet in the tenant  (represented as null)
 *   head_of_house / chef     → the outlets on their account (user.outletIds)
 *   employee                 → their own outlet(s); personal data stays self-only
 *
 * A `null` result means "no outlet restriction beyond tenant_id". Callers pass it
 * straight into SQL as a nullable uuid[] and gate with the idiom:
 *
 *   AND ($n::uuid[] IS NULL OR some_outlet_id = ANY($n))
 *
 * so admins match every row while everyone else is limited to their outlets.
 */
export function allowedOutletIds(user: AuthUser): string[] | null {
  return isAdminRole(user.role) ? null : (user.outletIds ?? []);
}

/**
 * Resolve the effective outlet filter for a LIST/READ endpoint that may receive
 * an optional client-supplied `outletId`. An out-of-scope request is rejected
 * (403). When no outletId is supplied, the caller's full allowed scope is used.
 * Returns a uuid[] to filter by, or `null` for "all outlets in the tenant".
 */
export function resolveOutletFilter(
  user: AuthUser,
  requestedOutletId?: string | null,
): string[] | null {
  const allowed = allowedOutletIds(user);
  if (requestedOutletId) {
    if (allowed !== null && !allowed.includes(requestedOutletId)) {
      throw new ForbiddenException("You do not have access to that outlet.");
    }
    return [requestedOutletId];
  }
  return allowed;
}

/**
 * Assert the caller may WRITE to a specific outlet (clock-in, manual entry,
 * roster generation, staff moves, …). Throws 403 if the outlet is out of scope.
 */
export function assertOutletAllowed(user: AuthUser, outletId: string): void {
  const allowed = allowedOutletIds(user);
  if (allowed !== null && !allowed.includes(outletId)) {
    throw new ForbiddenException("You do not have access to that outlet.");
  }
}

/**
 * DB-backed scope check: 404s unless `staffId` belongs to the caller's tenant AND
 * an outlet they may access. Shared by the endpoints that address a staff member
 * by id (leave balances, personal reads, …). Uses 404 (not 403) so existence
 * across outlets isn't leaked.
 */
export async function assertStaffInScope(db: Pool, user: AuthUser, staffId: string): Promise<void> {
  const outletFilter = allowedOutletIds(user);
  const res = await db.query(
    `SELECT 1 FROM staff
      WHERE id = $1 AND tenant_id = $2
        AND ($3::uuid[] IS NULL OR current_outlet_id = ANY($3))`,
    [staffId, user.tenantId, outletFilter],
  );
  if (!res.rows[0]) throw new NotFoundException("Staff not found");
}
