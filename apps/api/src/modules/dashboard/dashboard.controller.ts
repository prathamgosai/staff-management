import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { DashboardService } from "./dashboard.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

@ApiTags("Dashboard")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("overview")
  overview(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getOverview(user.tenantId);
  }

  @Get("today-snapshot")
  @ApiOperation({ summary: "Today: staff on shift, pending leave, pending approvals" })
  todaySnapshot(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getTodaySnapshot(user.tenantId);
  }

  @Get("staff-hierarchy")
  @ApiOperation({ summary: "All active staff with hierarchy level, outlet, department, today shift" })
  staffHierarchy(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("departmentId") departmentId: string,
  ) {
    return this.dashboardService.getStaffHierarchy(user.tenantId, outletId, departmentId);
  }

  @Get("outlet-breakdown")
  @ApiOperation({ summary: "Staff count per outlet with dept breakdown" })
  outletBreakdown(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getOutletStaffBreakdown(user.tenantId);
  }

  @Get("outlet-kpis")
  outletKpis(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.dashboardService.getOutletKpis(user.tenantId, outletId, startDate, endDate);
  }

  @Get("staff-performance")
  staffPerformance(
    @Query("outletId") outletId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.dashboardService.getStaffPerformance(outletId, startDate, endDate);
  }

  @Get("labor-cost-trend")
  laborCostTrend(
    @Query("outletId") outletId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.dashboardService.getLaborCostTrend(outletId, startDate, endDate);
  }

  @Get("coverage-heatmap")
  coverageHeatmap(
    @Query("outletId") outletId: string,
    @Query("weekStartDate") weekStartDate: string,
  ) {
    return this.dashboardService.getCoverageHeatmap(outletId, weekStartDate);
  }
}
