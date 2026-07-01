import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { OutletService } from "./outlet.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

@ApiTags("Outlets")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("outlets")
export class OutletController {
  constructor(private readonly outletService: OutletService) {}

  @Get()
  @ApiOperation({ summary: "List all outlets for the tenant" })
  findAll(@CurrentUser() user: AuthUser) {
    return this.outletService.findAll(user.tenantId, user.role, user.outletIds);
  }

  @Get("brands")
  @ApiOperation({ summary: "List all brands for the tenant" })
  getBrands(@CurrentUser() user: AuthUser) {
    return this.outletService.getBrands(user.tenantId);
  }

  @Post()
  @ApiOperation({ summary: "Create a new outlet" })
  create(@CurrentUser() user: AuthUser, @Body() body: {
    brandId?: string; brandName?: string; code: string; name: string; type: string;
    address: Record<string, string>; contact: Record<string, string>;
    seatingCapacity?: number;
  }) {
    return this.outletService.create(user.tenantId, body);
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.outletService.findOne(user.tenantId, id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Deactivate (soft-delete) an outlet" })
  deactivate(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.outletService.deactivate(user.tenantId, id);
  }

  @Get(":id/headcount-status")
  @ApiOperation({ summary: "Real-time headcount vs target for an outlet" })
  headcountStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("date") date: string,
  ) {
    return this.outletService.getHeadcountStatus(id, date);
  }

  @Get(":id/labor-cost")
  @ApiOperation({ summary: "Labor cost summary for an outlet" })
  laborCost(
    @Param("id") id: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.outletService.getLaborCostSummary(id, startDate, endDate);
  }
}
