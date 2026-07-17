import {
  Controller, Get, Post, Body, UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { RestaurantConfigService } from "./restaurant-config.service";
import { UpsertCategoryDto } from "./dto/restaurant-config.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

/**
 * Tenant-level lookups: restaurant categories.
 *
 * The ratio-templates GET/PUT lived here until the Ratio templates settings page
 * was removed (d576ec5) and left them with no caller. The template DATA is still
 * live — read by RestaurantConfigService.applyTemplate (POST
 * /outlets/:id/staffing-ratios/apply-template) and by the predictor — it just has
 * no HTTP editor. Edit templates via SQL/migration.
 */
@ApiTags("Restaurant Settings")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("settings")
export class RestaurantSettingsController {
  constructor(private readonly service: RestaurantConfigService) {}

  @Get("restaurant-categories")
  @RequirePermission("allocation:read")
  @ApiOperation({ summary: "List restaurant categories" })
  categories(@CurrentUser() user: AuthUser) {
    return this.service.listCategories(user);
  }

  @Post("restaurant-categories")
  @RequirePermission("staffing:ratios")
  @ApiOperation({ summary: "Add a restaurant category" })
  createCategory(@CurrentUser() user: AuthUser, @Body() dto: UpsertCategoryDto) {
    return this.service.createCategory(user, dto);
  }

}
