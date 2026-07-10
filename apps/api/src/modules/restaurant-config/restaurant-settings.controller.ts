import {
  Controller, Get, Post, Put, Body, Query, UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { RestaurantConfigService } from "./restaurant-config.service";
import { UpsertCategoryDto, UpdateTemplatesDto } from "./dto/restaurant-config.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

/**
 * Tenant-level lookups: restaurant categories + category → role ratio templates.
 * View = allocation:read; edit = staffing:ratios.
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

  @Get("ratio-templates")
  @RequirePermission("allocation:read")
  @ApiOperation({ summary: "Category → role ratio templates (optionally filtered by category)" })
  @ApiQuery({ name: "categoryId", required: false })
  templates(@CurrentUser() user: AuthUser, @Query("categoryId") categoryId?: string) {
    return this.service.getTemplates(user, categoryId);
  }

  @Put("ratio-templates")
  @RequirePermission("staffing:ratios")
  @ApiOperation({ summary: "Upsert ratio templates for one restaurant category" })
  updateTemplates(@CurrentUser() user: AuthUser, @Body() dto: UpdateTemplatesDto) {
    return this.service.updateTemplates(user, dto);
  }
}
