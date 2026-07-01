import { Controller, Get, Put, Body, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { RolesService } from "./roles.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

@ApiTags("Roles & Permissions")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("roles:manage")
@Controller("roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiOperation({ summary: "Account types with their permissions + the permission catalogue" })
  getMatrix(@CurrentUser() user: AuthUser) {
    return this.rolesService.getMatrix(user.tenantId);
  }

  @Get(":role/users")
  @ApiOperation({ summary: "List the users assigned to an account type" })
  getRoleUsers(@CurrentUser() user: AuthUser, @Param("role") role: string) {
    return this.rolesService.getUsersForRole(user.tenantId, role);
  }

  @Put(":role/permissions")
  @ApiOperation({ summary: "Replace the permission set for an account type" })
  updatePermissions(
    @CurrentUser() user: AuthUser,
    @Param("role") role: string,
    @Body() body: { permissions: string[] },
  ) {
    return this.rolesService.updateRolePermissions(user.tenantId, role, body?.permissions ?? []);
  }
}
