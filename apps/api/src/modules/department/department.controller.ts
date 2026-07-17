import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { DepartmentService } from "./department.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ADMIN_ROLES, type AuthUser } from "@workforceiq/shared";
import { CreateDepartmentDto, CreatePositionDto } from "./dto/department.dto";

@ApiTags("Departments & Positions")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("departments")
export class DepartmentController {
  constructor(private readonly svc: DepartmentService) {}

  @Get()
  getDepartments(@Query("outletId") outletId: string) {
    return this.svc.getDepartments(outletId);
  }

  @Post()
  @Roles(...ADMIN_ROLES)
  createDepartment(@Body() body: CreateDepartmentDto) {
    return this.svc.createDepartment(body.outletId, body.name);
  }

  @Delete(":id")
  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDepartment(@Param("id", ParseUUIDPipe) id: string) {
    return this.svc.deleteDepartment(id);
  }

  @Get("/positions")
  getPositions(@CurrentUser() user: AuthUser) {
    return this.svc.getPositions(user.tenantId);
  }

  @Post("/positions")
  @Roles(...ADMIN_ROLES)
  createPosition(
    @CurrentUser() user: AuthUser,
    @Body() body: CreatePositionDto,
  ) {
    return this.svc.createPosition(user.tenantId, body);
  }

  /**
   * SOPs + KPIs for a role. Readable by any authenticated user — a staff member has to be
   * able to read their own role's procedure — so no @Roles gate here.
   */
  @Get("/positions/:positionId/playbook")
  getPlaybook(@CurrentUser() user: AuthUser, @Param("positionId", ParseUUIDPipe) positionId: string) {
    return this.svc.getPlaybook(user.tenantId, positionId);
  }

  /** Clears the "unreviewed draft" flag once a manager has checked the SOP against reality. */
  @Post("/sops/:sopId/approve")
  @Roles(...ADMIN_ROLES)
  approveSop(@CurrentUser() user: AuthUser, @Param("sopId", ParseUUIDPipe) sopId: string) {
    return this.svc.approveSop(user.tenantId, sopId, user.id);
  }
}
