import {
  Controller, Get, Put, Post, Body, Param, UseGuards, ParseUUIDPipe,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { RestaurantConfigService } from "./restaurant-config.service";
import {
  UpdateConfigurationDto, UpdateStaffRatiosDto, ApplyTemplateDto,
} from "./dto/restaurant-config.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

/**
 * Per-outlet restaurant configuration + per-role staffing ratios (Feature 2).
 * View = allocation:read; edit = staffing:ratios (+ outlet scope enforced in the service).
 */
@ApiTags("Restaurant Configuration")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("outlets/:outletId")
export class RestaurantConfigController {
  constructor(private readonly service: RestaurantConfigService) {}

  @Get("configuration")
  @RequirePermission("allocation:read")
  @ApiOperation({ summary: "Restaurant configuration + capacity fields" })
  getConfig(@CurrentUser() user: AuthUser, @Param("outletId", ParseUUIDPipe) outletId: string) {
    return this.service.getConfiguration(user, outletId);
  }

  @Put("configuration")
  @RequirePermission("staffing:ratios")
  @ApiOperation({ summary: "Update restaurant configuration (staffing:ratios, own outlet)" })
  putConfig(@CurrentUser() user: AuthUser, @Param("outletId", ParseUUIDPipe) outletId: string, @Body() dto: UpdateConfigurationDto) {
    return this.service.updateConfiguration(user, outletId, dto);
  }

  @Get("staffing-ratios")
  @RequirePermission("allocation:read")
  @ApiOperation({ summary: "Per-role staffing ratios for the outlet (every position; null where unset)" })
  getRatios(@CurrentUser() user: AuthUser, @Param("outletId", ParseUUIDPipe) outletId: string) {
    return this.service.getStaffRatios(user, outletId);
  }

  @Put("staffing-ratios")
  @RequirePermission("staffing:ratios")
  @ApiOperation({ summary: "Set per-role staffing ratios (writes change history)" })
  putRatios(@CurrentUser() user: AuthUser, @Param("outletId", ParseUUIDPipe) outletId: string, @Body() dto: UpdateStaffRatiosDto) {
    return this.service.updateStaffRatios(user, outletId, dto);
  }

  @Get("staffing-ratios/history")
  @RequirePermission("allocation:read")
  @ApiOperation({ summary: "Ratio change history (who changed what, when)" })
  history(@CurrentUser() user: AuthUser, @Param("outletId", ParseUUIDPipe) outletId: string) {
    return this.service.getRatioHistory(user, outletId);
  }

  @Post("staffing-ratios/apply-template")
  @RequirePermission("staffing:ratios")
  @ApiOperation({ summary: "Prefill ratios from a category template (falls back to company defaults)" })
  applyTemplate(@CurrentUser() user: AuthUser, @Param("outletId", ParseUUIDPipe) outletId: string, @Body() dto: ApplyTemplateDto) {
    return this.service.applyTemplate(user, outletId, dto.categoryId);
  }
}
