import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { KioskService } from "../../modules/kiosk/kiosk.service";

/**
 * Authenticates a kiosk device from the `x-kiosk-token` header (or a `token`
 * query param, for the enrollment redirect). Resolves it to a live device via
 * KioskService and stamps the device context onto request.kiosk. Any missing /
 * invalid / revoked token yields a 401. This guard replaces JwtAuthGuard on the
 * kiosk punch routes — there is no user, only a device bound to one outlet.
 */
@Injectable()
export class KioskDeviceGuard implements CanActivate {
  constructor(private readonly kiosk: KioskService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header = req.headers?.["x-kiosk-token"];
    const raw: string | undefined =
      (Array.isArray(header) ? header[0] : header) || req.query?.token;
    req.kiosk = await this.kiosk.resolveDevice(raw);
    return true;
  }
}
