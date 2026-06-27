import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";

/**
 * Restrict a route (or whole controller) to the given role(s).
 * Must be combined with RolesGuard (and JwtAuthGuard, which populates request.user).
 *
 *   @Roles(ROLES.SUPER_ADMIN)
 *   @Post()
 *   create() { ... }
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
