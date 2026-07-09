import { Controller, Get, Post, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { ForecastingService } from "./forecasting.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

@ApiTags("Forecasting")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("forecasting")
export class ForecastingController {
  constructor(private readonly forecastingService: ForecastingService) {}

  @Post("generate")
  @ApiOperation({ summary: "Trigger demand forecast generation for an outlet" })
  generate(
    @Body() body: { outletId: string; startDate: string; endDate: string; model?: string },
  ) {
    return this.forecastingService.generateForecast(body);
  }

  @Get("forecasts")
  @ApiOperation({ summary: "Get demand forecasts for a date range" })
  getForecasts(
    @Query("outletId") outletId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.forecastingService.getForecasts(outletId, startDate, endDate);
  }

  @Post("pax-data")
  @ApiOperation({ summary: "Ingest PAX / cover count data" })
  ingestPaxData(@Body() body: { outletId: string; data: Array<{ date: string; hour: number; paxCount: number; revenue?: number }> }) {
    return this.forecastingService.ingestPaxData(body.outletId, body.data);
  }

  @Get("pax-data")
  getPaxData(
    @Query("outletId") outletId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.forecastingService.getPaxData(outletId, startDate, endDate);
  }

  @Get("accuracy")
  @ApiOperation({ summary: "Forecast accuracy report" })
  accuracy(
    @Query("outletId") outletId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.forecastingService.getAccuracyReport(outletId, startDate, endDate);
  }

  @Get("headcount-recommendation")
  @ApiOperation({ summary: "Get recommended headcount for a date/hour" })
  headcountRec(
    @Query("outletId") outletId: string,
    @Query("date") date: string,
  ) {
    return this.forecastingService.getHeadcountRecommendation(outletId, date);
  }

  @Get("staffing-suggestions")
  @UseGuards(PermissionsGuard)
  @RequirePermission("forecast:read")
  @ApiOperation({ summary: "Phase-1 day-of-week forecast: suggested vs rostered per day" })
  staffingSuggestions(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("weekStart") weekStart: string,
  ) {
    return this.forecastingService.getStaffingSuggestions(user, outletId, weekStart);
  }
}
