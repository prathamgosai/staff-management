import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, ParseUUIDPipe } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { AllocationService } from "./allocation.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

@ApiTags("Staff Allocation")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("allocation")
export class AllocationController {
  constructor(private readonly allocationService: AllocationService) {}

  @Get("transfers")
  getTransfers(
    @CurrentUser() user: AuthUser,
    @Query("status") status: string,
    @Query("outletId") outletId: string,
  ) {
    return this.allocationService.getTransfers(user.tenantId, { status, outletId });
  }

  @Post("transfers")
  @ApiOperation({ summary: "Request a staff transfer between outlets" })
  requestTransfer(
    @CurrentUser() user: AuthUser,
    @Body() body: { staffId: string; fromOutletId: string; toOutletId: string; effectiveDate: string; endDate?: string; type?: string; reason?: string },
  ) {
    return this.allocationService.requestTransfer(user.id, body);
  }

  @Put("transfers/:id/review")
  reviewTransfer(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { action: "approve" | "reject" },
  ) {
    return this.allocationService.reviewTransfer(id, user.id, body.action);
  }

  @Get("suggestions")
  @ApiOperation({ summary: "AI-powered cross-outlet staffing suggestions for understaffed outlets" })
  getSuggestions(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("date") date: string,
  ) {
    return this.allocationService.getStaffingSuggestions(user.tenantId, outletId, date);
  }
}
