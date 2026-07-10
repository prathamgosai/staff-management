import { Controller, Get, Param, Query, UseGuards, ParseUUIDPipe } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { StaffingService } from "./staffing.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

/**
 * Real-Time Staffing Requirement endpoints (Feature 3). View gated by allocation:read;
 * outlet scope enforced in the service. `date` defaults to today (IST).
 */
@ApiTags("Staffing")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("staffing")
export class StaffingController {
  constructor(private readonly service: StaffingService) {}

  @Get("requirements")
  @RequirePermission("allocation:read")
  @ApiOperation({ summary: "Staffing requirement summary for every outlet (card grid)" })
  @ApiQuery({ name: "date", required: false, example: "2026-07-09" })
  requirements(@CurrentUser() user: AuthUser, @Query("date") date?: string) {
    return this.service.getRequirements(user, date);
  }

  @Get("requirements/:outletId")
  @RequirePermission("allocation:read")
  @ApiOperation({ summary: "Per-role staffing breakdown for one outlet" })
  @ApiQuery({ name: "date", required: false })
  outlet(@CurrentUser() user: AuthUser, @Param("outletId", ParseUUIDPipe) outletId: string, @Query("date") date?: string) {
    return this.service.getOutletRequirements(user, outletId, date);
  }

  @Get("requirements/:outletId/trend")
  @RequirePermission("allocation:read")
  @ApiOperation({ summary: "Required-vs-available trend from persisted snapshots (30/90-day)" })
  @ApiQuery({ name: "days", required: false, example: 30 })
  trend(@CurrentUser() user: AuthUser, @Param("outletId", ParseUUIDPipe) outletId: string, @Query("days") days?: string) {
    const n = Math.min(Math.max(Number(days) || 30, 1), 365);
    return this.service.getTrend(user, outletId, n);
  }
}
