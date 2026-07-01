import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { DepartmentService } from "./department.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ADMIN_ROLES, type AuthUser } from "@workforceiq/shared";

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
  createDepartment(@Body() body: { outletId: string; name: string }) {
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
    @Body() body: { name: string; level?: number; defaultHoursWeek?: number },
  ) {
    return this.svc.createPosition(user.tenantId, body);
  }
}
