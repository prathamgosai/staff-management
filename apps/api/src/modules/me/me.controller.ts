import {
  Controller, Get, Patch, Post, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { MeService } from "./me.service";
import { StaffDocumentsService } from "../staff-documents/staff-documents.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { CreateLeaveRequestDto } from "./dto/create-leave-request.dto";
import { SelfPunchDto } from "./dto/self-punch.dto";
import type { AuthUser } from "@workforceiq/shared";

/**
 * Self-service endpoints for the authenticated user. Auth-only (any valid JWT),
 * NO special permission — every handler scopes to req.user.id inside MeService.
 * Nothing here trusts a client-supplied staffId / outletId.
 */
@ApiTags("Me (self-service)")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("me")
export class MeController {
  constructor(
    private readonly meService: MeService,
    private readonly staffDocumentsService: StaffDocumentsService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Own profile (safe fields only)" })
  getProfile(@CurrentUser() user: AuthUser) {
    return this.meService.getProfile(user);
  }

  @Patch("profile")
  @ApiOperation({ summary: "Update own phone, emergency contact and photo only" })
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.meService.updateProfile(user, dto);
  }

  @Get("shifts")
  @ApiOperation({ summary: "Own shifts for a week (defaults to the current week)" })
  @ApiQuery({ name: "week", required: false, example: "2026-07-06" })
  getShifts(@CurrentUser() user: AuthUser, @Query("week") week?: string) {
    return this.meService.getShifts(user, week);
  }

  @Get("attendance")
  @ApiOperation({ summary: "Own attendance for a month + summary (defaults to current month)" })
  @ApiQuery({ name: "month", required: false, example: "2026-07" })
  getAttendance(@CurrentUser() user: AuthUser, @Query("month") month?: string) {
    return this.meService.getAttendance(user, month);
  }

  @Get("clock-status")
  @ApiOperation({ summary: "Own clock state today: outlet, whether clocked in, today's record" })
  getClockStatus(@CurrentUser() user: AuthUser) {
    return this.meService.getClockStatus(user);
  }

  @Post("clock-in")
  @ApiOperation({ summary: "Clock IN as yourself from your own device (geofenced server-side)" })
  clockIn(@CurrentUser() user: AuthUser, @Body() body: SelfPunchDto) {
    return this.meService.clockInSelf(user, body);
  }

  @Post("clock-out")
  @ApiOperation({ summary: "Clock OUT of your own open record for today" })
  clockOut(@CurrentUser() user: AuthUser, @Body() body: SelfPunchDto) {
    return this.meService.clockOutSelf(user, body);
  }

  @Get("leave")
  @ApiOperation({ summary: "Own leave balance, requests and available leave types" })
  getLeave(@CurrentUser() user: AuthUser) {
    return this.meService.getLeave(user);
  }

  @Get("documents")
  @ApiOperation({ summary: "Own documents (read-only, metadata only)" })
  getDocuments(@CurrentUser() user: AuthUser) {
    return this.staffDocumentsService.listOwn(user);
  }

  @Post("leave-requests")
  @ApiOperation({ summary: "Submit a leave request for yourself" })
  createLeaveRequest(@CurrentUser() user: AuthUser, @Body() dto: CreateLeaveRequestDto) {
    return this.meService.createLeaveRequest(user, dto);
  }

  @Delete("leave-requests/:id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel your own leave request (only while pending)" })
  cancelLeaveRequest(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.meService.cancelLeaveRequest(user, id);
  }
}
