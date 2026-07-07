import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { KioskDevice } from "../../modules/kiosk/kiosk.service";

/** Pulls the device context stamped onto the request by KioskDeviceGuard. */
export const CurrentKiosk = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): KioskDevice => {
    return ctx.switchToHttp().getRequest().kiosk;
  },
);
