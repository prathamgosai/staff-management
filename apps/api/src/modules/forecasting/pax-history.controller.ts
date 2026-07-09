import { Controller, Get, Post, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { ForecastingService } from "./forecasting.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

/**
 * Daily covers (pax) history import + read. Import writes are gated by outlet:write
 * (admin/hr) and per-row outlet-scoped; reads by forecast:read (admin/hr/head_of_house),
 * outlet-scoped. Distinct from the legacy /forecasting/pax-data ingest (which is ungated).
 */
@ApiTags("Pax history")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("pax-history")
export class PaxHistoryController {
  constructor(private readonly forecastingService: ForecastingService) {}

  @Post("import")
  @RequirePermission("outlet:write")
  @ApiOperation({ summary: "Bulk-import daily covers (upsert on outlet + date)" })
  import(
    @CurrentUser() user: AuthUser,
    @Body() body: { rows: Array<{ outletId?: string; outletName?: string; date: string; pax: number; revenue?: number | null }> },
  ) {
    return this.forecastingService.importDailyPax(user, body?.rows ?? []);
  }

  @Get()
  @RequirePermission("forecast:read")
  @ApiOperation({ summary: "Read imported daily covers for an outlet" })
  list(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.forecastingService.getDailyPax(user, outletId, from, to);
  }
}
