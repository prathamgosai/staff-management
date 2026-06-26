import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, ParseUUIDPipe } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { AttendanceService } from "./attendance.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

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
    return this.attendanceService.findAll({ tenantId: user.tenantId, outletId, date, startDate, endDate, staffId });
  }

  @Post("clock-in")
  @ApiOperation({ summary: "Record staff clock-in" })
  clockIn(@Body() body: { staffId: string; outletId: string; shiftId?: string; method: string; gpsLat?: number; gpsLng?: number }) {
    return this.attendanceService.clockIn(body);
  }

  @Post("clock-out")
  @ApiOperation({ summary: "Record staff clock-out" })
  clockOut(@Body() body: { attendanceId: string; method: string; gpsLat?: number; gpsLng?: number }) {
    return this.attendanceService.clockOut(body);
  }

  @Post("manual-entry")
  @ApiOperation({ summary: "Manually add an attendance record for a specific date" })
  manualEntry(
    @Body() body: { staffId: string; outletId: string; date: string; clockIn: string; clockOut?: string; status: string; note?: string },
  ) {
    return this.attendanceService.manualEntry(body);
  }

  @Post("corrections")
  @ApiOperation({ summary: "Request attendance correction" })
  requestCorrection(
    @CurrentUser() user: AuthUser,
    @Body() body: { attendanceId: string; correctedClockIn?: string; correctedClockOut?: string; reason: string },
  ) {
    return this.attendanceService.requestCorrection(user.id, body);
  }

  @Put("corrections/:id/review")
  reviewCorrection(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { action: "approve" | "reject" },
  ) {
    return this.attendanceService.reviewCorrection(id, user.id, body.action);
  }

  @Get("live-status")
  @ApiOperation({ summary: "Live clock-in status for an outlet (who is in/out right now)" })
  liveStatus(@Query("outletId") outletId: string) {
    return this.attendanceService.getLiveStatus(outletId);
  }
}
