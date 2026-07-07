import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { KioskService, KioskDevice } from "./kiosk.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { KioskDeviceGuard } from "../../common/guards/kiosk-device.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CurrentKiosk } from "../../common/decorators/kiosk-device.decorator";
import type { AuthUser } from "@workforceiq/shared";

/**
 * Manager-facing kiosk administration — enroll / revoke devices and set staff
 * PINs. JWT-guarded and gated by `attendance:write` (admin / hr / head_of_house;
 * super_admin via "*"), all tenant + outlet scoped.
 */
@ApiTags("Kiosk")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("kiosk")
export class KioskAdminController {
  constructor(private readonly kiosk: KioskService) {}

  @Post("devices")
  @RequirePermission("attendance:write")
  @ApiOperation({ summary: "Enroll a kiosk device on an outlet (returns the token once)" })
  createDevice(@CurrentUser() user: AuthUser, @Body() body: { outletId: string; label: string }) {
    return this.kiosk.createDevice(user, body.outletId, body.label);
  }

  @Get("devices")
  @RequirePermission("attendance:write")
  @ApiOperation({ summary: "List kiosk devices for an outlet (metadata only)" })
  listDevices(@CurrentUser() user: AuthUser, @Query("outletId") outletId: string) {
    return this.kiosk.listDevices(user, outletId);
  }

  @Delete("devices/:id")
  @RequirePermission("attendance:write")
  @ApiOperation({ summary: "Revoke a kiosk device" })
  revokeDevice(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.kiosk.revokeDevice(user, id);
  }

  @Put("staff/:staffId/pin")
  @RequirePermission("attendance:write")
  @ApiOperation({ summary: "Set or clear a staff member's kiosk PIN (4–6 digits, null clears)" })
  setStaffPin(
    @CurrentUser() user: AuthUser,
    @Param("staffId", ParseUUIDPipe) staffId: string,
    @Body() body: { pin: string | null },
  ) {
    return this.kiosk.setStaffPin(user, staffId, body.pin);
  }
}

/**
 * Device-facing kiosk endpoints — authenticated ONLY by the device token
 * (x-kiosk-token header), no user JWT. Hard-throttled per IP because they take
 * a PIN, and every punch is stamped source='kiosk', scoped to the device's outlet.
 */
@ApiTags("Kiosk")
@UseGuards(KioskDeviceGuard)
@Controller("kiosk")
export class KioskController {
  constructor(private readonly kiosk: KioskService) {}

  @Get("session")
  @ApiOperation({ summary: "Kiosk screen bootstrap — which outlet this device serves" })
  session(@CurrentKiosk() device: KioskDevice) {
    return this.kiosk.session(device);
  }

  @Post("clock-in")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Kiosk clock-in (Employee ID + PIN)" })
  clockIn(@CurrentKiosk() device: KioskDevice, @Body() body: { employeeId: string; pin: string }) {
    return this.kiosk.clockIn(device, body.employeeId, body.pin);
  }

  @Post("clock-out")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Kiosk clock-out (Employee ID + PIN)" })
  clockOut(@CurrentKiosk() device: KioskDevice, @Body() body: { employeeId: string; pin: string }) {
    return this.kiosk.clockOut(device, body.employeeId, body.pin);
  }
}
