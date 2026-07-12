import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { AuditService } from "./audit.service";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { PermissionsGuard } from "../guards/permissions.guard";
import { RequirePermission } from "../decorators/require-permission.decorator";
import { CurrentUser } from "../decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

/**
 * Read the "who changed what, when" trail. Gated on accounts:manage (admin / hr /
 * super_admin — the same audience that manages accounts) and tenant-scoped in the service.
 * Reuses an existing permission so no role can be accidentally locked out.
 */
@ApiTags("Audit")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission("accounts:manage")
  @ApiOperation({ summary: "Audit trail for the tenant, newest first (requires accounts:manage)" })
  @ApiQuery({ name: "action", required: false })
  @ApiQuery({ name: "entityType", required: false })
  @ApiQuery({ name: "entityId", required: false })
  @ApiQuery({ name: "limit", required: false, example: 50 })
  @ApiQuery({ name: "offset", required: false, example: 0 })
  list(
    @CurrentUser() user: AuthUser,
    @Query("action") action?: string,
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.audit.list(user.tenantId, {
      action,
      entityType,
      entityId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}
