import { Controller, Post, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { CapacityService } from "./capacity.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";
import { StaffingProjectionDto } from "./dto/planning.dto";

/**
 * New-outlet planning. Stateless projection gated by allocation:read (admin/hr/head_of_house),
 * outlet-scoped inside the service.
 */
@ApiTags("Planning")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("planning")
export class PlanningController {
  constructor(private readonly capacityService: CapacityService) {}

  @Post("staffing-projection")
  @RequirePermission("allocation:read")
  @ApiOperation({ summary: "Project staff needed for a planned outlet (from pax or tables)" })
  projection(
    @CurrentUser() user: AuthUser,
    @Body() body: StaffingProjectionDto,
  ) {
    return this.capacityService.getStaffingProjection(user, body ?? {});
  }
}
