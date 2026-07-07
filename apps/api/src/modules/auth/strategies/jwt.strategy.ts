import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { isAdminRole } from "@workforceiq/shared";
import type { TokenPayload, AuthUser } from "@workforceiq/shared";
import { RolesService } from "../../roles/roles.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly rolesService: RolesService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET") ?? "fallback_secret",
    });
  }

  // Resolve permissions from the editable matrix on every request so changes to
  // an account type take effect immediately, without waiting for re-login.
  async validate(payload: TokenPayload): Promise<AuthUser> {
    if (!payload.sub) throw new UnauthorizedException();
    const permissions = await this.rolesService.getPermissionsForRole(payload.tenantId, payload.role);
    // Outlet scope is only consulted for non-admin roles (admins = all outlets), and it
    // must reflect an outlet reassignment without re-login — so resolve it live (cached)
    // for them rather than trusting the (possibly stale) value baked into the token.
    const outletIds = isAdminRole(payload.role)
      ? payload.outletIds
      : await this.rolesService.getOutletIdsForUser(payload.sub, payload.tenantId);
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      outletIds,
      tenantId: payload.tenantId,
      name: "",
      permissions,
    };
  }
}
