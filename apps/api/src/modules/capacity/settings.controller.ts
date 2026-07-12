import { Controller, Get, Put, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { CapacityService } from "./capacity.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";
import { UpdateRatiosDto } from "./dto/settings.dto";

/**
 * Tenant settings that back the capacity model. Read is gated by allocation:read
 * (admin/hr/head_of_house); edits reuse roles:manage — the same gate as the
 * /account-types settings-admin surface (admin/hr; super_admin via '*').
 */
@ApiTags("Settings")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("settings")
export class SettingsController {
  constructor(private readonly capacityService: CapacityService) {}

  @Get("staffing-ratios")
  @RequirePermission("allocation:read")
  @ApiOperation({ summary: "List the tenant's per-category staffing ratios" })
  getRatios(@CurrentUser() user: AuthUser) {
    return this.capacityService.getRatios(user.tenantId);
  }

  @Put("staffing-ratios")
  @RequirePermission("roles:manage")
  @ApiOperation({ summary: "Update the tenant's staffing ratios + covers-per-on-duty-staff" })
  updateRatios(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateRatiosDto,
  ) {
    return this.capacityService.updateRatios(user.tenantId, body ?? {});
  }
}
