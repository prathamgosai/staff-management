import {
  Controller, Get, Post, Put, Delete, Patch,
  Body, Param, Query, UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { StaffService } from "./staff.service";
import { CreateStaffDto } from "./dto/create-staff.dto";
import { UpdateStaffDto } from "./dto/update-staff.dto";
import { UpdateAvatarDto } from "./dto/update-avatar.dto";
import { StaffQueryDto } from "./dto/staff-query.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

@ApiTags("Staff")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("staff")
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @ApiOperation({ summary: "List all staff (paginated, filterable)" })
  findAll(@CurrentUser() user: AuthUser, @Query() query: StaffQueryDto) {
    return this.staffService.findAll(user.tenantId, query);
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.staffService.findOne(user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: "Create a new staff member" })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    return this.staffService.create(user.tenantId, dto);
  }

  @Put(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staffService.update(user.tenantId, id, dto);
  }

  @Put(":id/avatar")
  @ApiOperation({ summary: "Upload, change, or remove a staff member's profile photo" })
  updateAvatar(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateAvatarDto,
  ) {
    return this.staffService.updateAvatar(user.tenantId, id, dto.avatarUrl);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.staffService.softDelete(user.tenantId, id);
  }

  @Get(":id/attendance-summary")
  @ApiOperation({ summary: "Get attendance summary for a staff member" })
  attendanceSummary(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.staffService.getAttendanceSummary(id, startDate, endDate);
  }

  @Get(":id/leave-balances")
  leaveBalances(@Param("id", ParseUUIDPipe) id: string) {
    return this.staffService.getLeaveBalances(id);
  }

  @Get(":id/schedule")
  @ApiOperation({ summary: "Get upcoming schedule for a staff member" })
  schedule(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("weekStartDate") weekStartDate: string,
  ) {
    return this.staffService.getSchedule(id, weekStartDate);
  }
}
