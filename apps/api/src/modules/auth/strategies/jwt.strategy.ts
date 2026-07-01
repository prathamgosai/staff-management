import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
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
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      outletIds: payload.outletIds,
      tenantId: payload.tenantId,
      name: "",
      permissions,
    };
  }
}
