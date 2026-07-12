import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { OutletService } from "./outlet.service";
import { CapacityService } from "../capacity/capacity.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

@ApiTags("Outlets")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("outlets")
export class OutletController {
  constructor(
    private readonly outletService: OutletService,
    private readonly capacityService: CapacityService,
  ) {}

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
  @RequirePermission("outlet:write")
  @ApiOperation({ summary: "Create a new outlet" })
  create(@CurrentUser() user: AuthUser, @Body() body: {
    brandId?: string; brandName?: string; code: string; name: string; type: string;
    address: Record<string, string>; contact: Record<string, string>;
    seatingCapacity?: number;
  }) {
    return this.outletService.create(user.tenantId, body);
  }

  @Get("capacity-analysis")
  @UseGuards(PermissionsGuard)
  @RequirePermission("allocation:read")
  @ApiOperation({ summary: "Required vs actual staffing per dine-in outlet (capacity model)" })
  capacityAnalysis(@CurrentUser() user: AuthUser) {
    return this.capacityService.getCapacityAnalysis(user);
  }

  @Get("rebalancing-suggestions")
  @UseGuards(PermissionsGuard)
  @RequirePermission("allocation:read")
  @ApiOperation({ summary: "Advisory cross-outlet staff rebalancing suggestions" })
  rebalancingSuggestions(@CurrentUser() user: AuthUser) {
    return this.capacityService.getRebalancingSuggestions(user);
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.outletService.findOne(user, id);
  }

  @Put(":id/capacity")
  @UseGuards(PermissionsGuard)
  @RequirePermission("outlet:write")
  @ApiOperation({ summary: "Set an outlet's table count and max pax (capacity model)" })
  updateCapacity(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: { totalTables?: number | null; maxPax?: number | null },
  ) {
    return this.outletService.updateCapacity(user, id, body);
  }

  @Delete(":id")
  @RequirePermission("outlet:write")
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
    return this.outletService.getHeadcountStatus(user, id, date);
  }

  @Get(":id/labor-cost")
  @ApiOperation({ summary: "Labor cost summary for an outlet" })
  laborCost(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.outletService.getLaborCostSummary(user, id, startDate, endDate);
  }
}
