import { Module } from "@nestjs/common";
import { KioskService } from "./kiosk.service";
import { KioskAdminController, KioskController } from "./kiosk.controller";
import { KioskDeviceGuard } from "../../common/guards/kiosk-device.guard";

/**
 * Kiosk clock-in mode. DB_POOL is global; the device guard is provided here so
 * it can inject KioskService for token resolution.
 */
@Module({
  controllers: [KioskAdminController, KioskController],
  providers: [KioskService, KioskDeviceGuard],
})
export class KioskModule {}
