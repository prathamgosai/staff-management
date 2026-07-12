import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, ParseUUIDPipe } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { LeaveService } from "./leave.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { resolveOutletFilter } from "../../common/auth/outlet-scope";
import type { AuthUser } from "@workforceiq/shared";
import { ApplyLeaveDto, ReviewLeaveDto } from "./dto/leave.dto";

@ApiTags("Leave")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("leave")
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get("requests")
  @ApiOperation({ summary: "List leave requests (filterable)" })
  getRequests(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("status") status: string,
    @Query("staffId") staffId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.leaveService.getRequests({ tenantId: user.tenantId, outletFilter: resolveOutletFilter(user, outletId), status, staffId, startDate, endDate });
  }

  @Post("requests")
  @ApiOperation({ summary: "Submit a leave request" })
  applyLeave(
    @CurrentUser() user: AuthUser,
    @Body() body: ApplyLeaveDto,
  ) {
    return this.leaveService.applyLeave(body, user);
  }

  @Put("requests/:id/review")
  @RequirePermission("leave:approve")
  @ApiOperation({ summary: "Approve or reject a leave request (leave:approve)" })
  reviewLeave(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ReviewLeaveDto,
  ) {
    return this.leaveService.reviewLeave(user, id, body);
  }

  @Get("balances/:staffId")
  @ApiOperation({ summary: "Get leave balances for a staff member" })
  getBalances(@CurrentUser() user: AuthUser, @Param("staffId", ParseUUIDPipe) staffId: string) {
    return this.leaveService.getBalances(staffId, user);
  }

  @Get("calendar")
  @ApiOperation({ summary: "Leave calendar view for an outlet" })
  calendar(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.leaveService.getCalendar(user, outletId, startDate, endDate);
  }

  @Get("types")
  getLeaveTypes(@CurrentUser() user: AuthUser) {
    return this.leaveService.getLeaveTypes(user.tenantId);
  }
}
