import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
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

  @Get("summary")
  @ApiOperation({ summary: "KPI summary: total staff, outlets, on-shift, on-leave/off (optionally ?outletId scoped)" })
  summary(@CurrentUser() user: AuthUser, @Query("outletId") outletId?: string) {
    return this.dashboardService.getSummary(user, outletId);
  }

  @Get("outlet/:outletId/staff-today")
  @ApiOperation({ summary: "Per-staff today status for one outlet (on_shift / on_leave / off / late)" })
  outletStaffToday(@CurrentUser() user: AuthUser, @Param("outletId") outletId: string) {
    return this.dashboardService.getOutletStaffToday(user, outletId);
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
    return this.dashboardService.getStaffHierarchy(user, outletId, departmentId);
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
    return this.dashboardService.getOutletKpis(user, outletId, startDate, endDate);
  }

  @Get("staff-performance")
  staffPerformance(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.dashboardService.getStaffPerformance(user, outletId, startDate, endDate);
  }

  @Get("labor-cost-trend")
  laborCostTrend(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.dashboardService.getLaborCostTrend(user, outletId, startDate, endDate);
  }

  @Get("coverage-heatmap")
  coverageHeatmap(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("weekStartDate") weekStartDate: string,
  ) {
    return this.dashboardService.getCoverageHeatmap(user, outletId, weekStartDate);
  }
}
