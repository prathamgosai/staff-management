import { Controller, Get, Post, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { ForecastingService } from "./forecasting.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";
import { GenerateForecastDto, IngestPaxDataDto } from "./dto/forecasting.dto";

@ApiTags("Forecasting")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("forecasting")
export class ForecastingController {
  constructor(private readonly forecastingService: ForecastingService) {}

  @Post("generate")
  @RequirePermission("forecast:write")
  @ApiOperation({ summary: "Trigger demand forecast generation for an outlet" })
  generate(
    @CurrentUser() user: AuthUser,
    @Body() body: GenerateForecastDto,
  ) {
    return this.forecastingService.generateForecast(user, body);
  }

  @Get("forecasts")
  @RequirePermission("forecast:read")
  @ApiOperation({ summary: "Get demand forecasts for a date range" })
  getForecasts(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.forecastingService.getForecasts(user, outletId, startDate, endDate);
  }

  @Post("pax-data")
  @RequirePermission("forecast:write")
  @ApiOperation({ summary: "Ingest PAX / cover count data" })
  ingestPaxData(
    @CurrentUser() user: AuthUser,
    @Body() body: IngestPaxDataDto,
  ) {
    return this.forecastingService.ingestPaxData(user, body.outletId, body.data);
  }

  @Get("pax-data")
  @RequirePermission("forecast:read")
  getPaxData(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.forecastingService.getPaxData(user, outletId, startDate, endDate);
  }

  @Get("accuracy")
  @RequirePermission("forecast:read")
  @ApiOperation({ summary: "Forecast accuracy report" })
  accuracy(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.forecastingService.getAccuracyReport(user, outletId, startDate, endDate);
  }

  @Get("headcount-recommendation")
  @RequirePermission("forecast:read")
  @ApiOperation({ summary: "Get recommended headcount for a date/hour" })
  headcountRec(
    @CurrentUser() user: AuthUser,
    @Query("outletId") outletId: string,
    @Query("date") date: string,
  ) {
    return this.forecastingService.getHeadcountRecommendation(user, outletId, date);
  }

  @Get("staffing-autopilot")
  @RequirePermission("forecast:read")
  @ApiOperation({ summary: "AI autopilot: predicted PAX -> required staff -> cross-outlet transfer recommendations" })
  staffingAutopilot(@CurrentUser() user: AuthUser, @Query("date") date?: string) {
    return this.forecastingService.getStaffingAutopilot(user, date);
  }

  @Get("staffing-suggestions")
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
