import { SetMetadata } from "@nestjs/common";

export const PERMISSION_KEY = "required_permission";

/**
 * Restrict a route to holders of a specific permission from the editable
 * role→permission matrix (e.g. "roles:manage"). Combine with PermissionsGuard
 * and JwtAuthGuard (which populates request.user.permissions):
 *
 *   @UseGuards(JwtAuthGuard, PermissionsGuard)
 *   @RequirePermission("roles:manage")
 *
 * super_admin (permissions = ["*"]) passes every check.
 */
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);
