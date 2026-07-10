import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { StaffingService } from "./staffing.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

/**
 * Company staffing dashboard (Feature 4) — one batched call (no per-outlet N+1). Gated by
 * allocation:read; outlet-scoped so a manager sees only their own outlets' rollup.
 */
@ApiTags("Dashboard")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("dashboard")
export class StaffingDashboardController {
  constructor(private readonly service: StaffingService) {}

  @Get("company-staffing")
  @RequirePermission("allocation:read")
  @ApiOperation({ summary: "Company-wide staffing KPIs + per-outlet distribution" })
  @ApiQuery({ name: "date", required: false })
  company(@CurrentUser() user: AuthUser, @Query("date") date?: string) {
    return this.service.getCompanyStaffing(user, date);
  }
}
