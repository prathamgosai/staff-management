import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import type { Response } from "express";
import { ReportsService } from "./reports.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

/**
 * CSV exports for payroll / attendance. Gated on reports:export and tenant + outlet scoped
 * in the service. Streams a downloadable file (Content-Disposition: attachment).
 */
@ApiTags("Reports")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private send(res: Response, file: { filename: string; csv: string }): void {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(file.csv);
  }

  @Get("payroll-summary.csv")
  @RequirePermission("reports:export")
  @ApiOperation({ summary: "Per-employee payroll summary CSV (hours + computed pay) for a period" })
  @ApiQuery({ name: "startDate", example: "2026-07-01" })
  @ApiQuery({ name: "endDate", example: "2026-07-31" })
  @ApiQuery({ name: "outletId", required: false })
  async payroll(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("outletId") outletId?: string,
  ): Promise<void> {
    this.send(res, await this.reports.payrollSummaryCsv(user, { startDate, endDate, outletId }));
  }

  @Get("attendance.csv")
  @RequirePermission("reports:export")
  @ApiOperation({ summary: "Detailed attendance CSV (one row per record) for a period" })
  @ApiQuery({ name: "startDate", example: "2026-07-01" })
  @ApiQuery({ name: "endDate", example: "2026-07-31" })
  @ApiQuery({ name: "outletId", required: false })
  async attendance(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("outletId") outletId?: string,
  ): Promise<void> {
    this.send(res, await this.reports.attendanceCsv(user, { startDate, endDate, outletId }));
  }
}
