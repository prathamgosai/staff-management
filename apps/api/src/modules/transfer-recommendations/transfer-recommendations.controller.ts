import { Controller, Get, Post, Param, Query, UseGuards, ParseUUIDPipe } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { TransferRecommendationsService } from "./transfer-recommendations.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

/**
 * Transfer recommendations (Feature 6). View/regenerate = allocation:read; accept/reject =
 * allocation:write. Outlet-scoped. Accepting returns a deep-link into the existing /allocation flow.
 */
@ApiTags("Transfer Recommendations")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("transfer-recommendations")
export class TransferRecommendationsController {
  constructor(private readonly service: TransferRecommendationsService) {}

  @Get()
  @RequirePermission("allocation:read")
  @ApiOperation({ summary: "List transfer recommendations (optionally by status)" })
  @ApiQuery({ name: "status", required: false, enum: ["pending", "accepted", "rejected", "executed"] })
  list(@CurrentUser() user: AuthUser, @Query("status") status?: string) {
    return this.service.list(user, status);
  }

  @Post("regenerate")
  @RequirePermission("allocation:read")
  @ApiOperation({ summary: "Regenerate recommendations from live staffing (idempotent)" })
  regenerate(@CurrentUser() user: AuthUser) {
    return this.service.regenerate(user);
  }

  @Post(":id/accept")
  @RequirePermission("allocation:write")
  @ApiOperation({ summary: "Accept a recommendation (deep-links into /allocation)" })
  accept(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.accept(user, id);
  }

  @Post(":id/reject")
  @RequirePermission("allocation:write")
  @ApiOperation({ summary: "Reject a recommendation" })
  reject(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.reject(user, id);
  }
}
