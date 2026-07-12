import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, ParseUUIDPipe } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { AttendanceService } from "./attendance.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { resolveOutletFilter } from "../../common/auth/outlet-scope";
import type { AuthUser } from "@workforceiq/shared";
import { ClockInDto, ClockOutDto, ManualEntryDto, RequestCorrectionDto, ReviewCorrectionDto } from "./dto/attendance.dto";

@ApiTags("Attendance")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("attendance")
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get()
  @ApiOperation({ summary: "Get attendance records (filterable by outlet / date)" })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("date") date: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("staffId") staffId: string,
  ) {
    return this.attendanceService.findAll({ tenantId: user.tenantId, outletFilter: resolveOutletFilter(user, outletId), date, startDate, endDate, staffId });
  }

  @Post("clock-in")
  @ApiOperation({ summary: "Record staff clock-in" })
  clockIn(@CurrentUser() user: AuthUser, @Body() body: ClockInDto) {
    return this.attendanceService.clockIn(user, body);
  }

  @Post("clock-out")
  @ApiOperation({ summary: "Record staff clock-out" })
  clockOut(@CurrentUser() user: AuthUser, @Body() body: ClockOutDto) {
    return this.attendanceService.clockOut(user, body);
  }

  @Post("manual-entry")
  @ApiOperation({ summary: "Manually add an attendance record for a specific date" })
  manualEntry(
    @CurrentUser() user: AuthUser,
    @Body() body: ManualEntryDto,
  ) {
    return this.attendanceService.manualEntry(user, body);
  }

  @Post("corrections")
  @ApiOperation({ summary: "Request attendance correction" })
  requestCorrection(
    @CurrentUser() user: AuthUser,
    @Body() body: RequestCorrectionDto,
  ) {
    return this.attendanceService.requestCorrection(user, body);
  }

  @Put("corrections/:id/review")
  reviewCorrection(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ReviewCorrectionDto,
  ) {
    return this.attendanceService.reviewCorrection(user, id, body.action);
  }

  @Get("live-status")
  @ApiOperation({ summary: "Live clock-in status for an outlet (who is in/out right now)" })
  liveStatus(@CurrentUser() user: AuthUser, @Query("outletId") outletId: string) {
    return this.attendanceService.getLiveStatus(user, outletId);
  }
}
