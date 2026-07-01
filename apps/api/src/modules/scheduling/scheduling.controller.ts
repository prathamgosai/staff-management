import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { SchedulingService } from "./scheduling.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

@ApiTags("Scheduling")
@ApiBearerAuth()
// PermissionsGuard only enforces routes that carry @RequirePermission(); the
// unannotated routes here stay JwtAuthGuard-only, exactly as before.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("scheduling")
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Get("schedules")
  @ApiOperation({ summary: "Get weekly schedules for an outlet" })
  getSchedules(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("weekStartDate") weekStartDate: string,
  ) {
    return this.schedulingService.getSchedule(user.tenantId, outletId, weekStartDate);
  }

  @Post("schedules/generate")
  @ApiOperation({ summary: "Auto-generate a schedule for the week" })
  generateSchedule(
    @CurrentUser() user: AuthUser,
    @Body() body: { outletId: string; weekStartDate: string },
  ) {
    return this.schedulingService.triggerAutoGenerate(user.tenantId, body.outletId, body.weekStartDate, user.id);
  }

  @Post("schedules/:id/publish")
  @ApiOperation({ summary: "Publish a draft schedule" })
  publish(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.schedulingService.publishSchedule(user.tenantId, id, user.id);
  }

  @Get("shifts")
  getShifts(
    @Query("scheduleId") scheduleId: string,
    @Query("outletId") outletId: string,
    @Query("date") date: string,
  ) {
    return this.schedulingService.getShifts(scheduleId, outletId, date);
  }

  @Get("today")
  @ApiOperation({ summary: "Today's shift assignments across all outlets" })
  getTodayShifts(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("departmentId") departmentId: string,
  ) {
    return this.schedulingService.getTodayShifts(user.tenantId, outletId, departmentId);
  }

  @Post("shifts/:shiftId/assign")
  @ApiOperation({ summary: "Assign staff to a shift" })
  assignStaff(
    @Param("shiftId", ParseUUIDPipe) shiftId: string,
    @Body() body: { staffIds: string[] },
  ) {
    return this.schedulingService.assignStaff(shiftId, body.staffIds);
  }

  @Delete("shifts/:shiftId/assign/:staffId")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAssignment(
    @Param("shiftId", ParseUUIDPipe) shiftId: string,
    @Param("staffId", ParseUUIDPipe) staffId: string,
  ) {
    return this.schedulingService.removeAssignment(shiftId, staffId);
  }

  @Get("shift-templates")
  getTemplates(@CurrentUser() user: AuthUser, @Query("outletId") outletId: string) {
    return this.schedulingService.getShiftTemplates(outletId);
  }

  @Put("shift-templates/:id")
  @ApiOperation({ summary: "Manually override a shift's start/end time" })
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { startTime: string; endTime: string; breakMinutes?: number; fromWeekStartDate?: string },
  ) {
    return this.schedulingService.updateShiftTemplate(user.tenantId, id, body);
  }

  @Post("assignments/move")
  @RequirePermission("schedule:write")
  @ApiOperation({ summary: "Move one staff member onto a specific shift (this week onward)" })
  moveStaff(
    @CurrentUser() user: AuthUser,
    @Body() body: { outletId: string; staffId: string; templateId: string; weekStartDate: string },
  ) {
    return this.schedulingService.moveStaffToShift(user.tenantId, user.id, body);
  }

  @Get("coverage-summary")
  @ApiOperation({ summary: "Weekly coverage % and gap analysis" })
  coverageSummary(
    @Query("outletId") outletId: string,
    @Query("weekStartDate") weekStartDate: string,
  ) {
    return this.schedulingService.getCoverageSummary(outletId, weekStartDate);
  }

  @Get("weekly-roster")
  @ApiOperation({ summary: "Full roster: who is on which shift, which day, for a given outlet+week" })
  weeklyRoster(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("weekStartDate") weekStartDate: string,
  ) {
    return this.schedulingService.getWeeklyRoster(user.tenantId, outletId, weekStartDate);
  }

  @Post("swap-requests")
  @ApiOperation({ summary: "Request a shift swap" })
  requestSwap(@CurrentUser() user: AuthUser, @Body() body: { requesterShiftId: string; targetStaffId?: string; targetShiftId?: string; reason?: string }) {
    return this.schedulingService.requestSwap(user.id, body);
  }
}
