import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSION_KEY } from "../decorators/require-permission.decorator";
import type { AuthUser } from "@workforceiq/shared";

/**
 * Enforces @RequirePermission() metadata against the user's effective
 * permissions (stamped onto request.user by JwtStrategy). A user passes when
 * they hold the exact permission, the wildcard "*", or are super_admin — the
 * last is a safety net so an empty/misseeded matrix can never lock admins out.
 * Routes without @RequirePermission() are unaffected.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const perms = user?.permissions ?? [];
    const allowed = user?.role === "super_admin" || perms.includes("*") || perms.includes(required);
    if (!allowed) {
      throw new ForbiddenException("You do not have permission to perform this action.");
    }
    return true;
  }
}
