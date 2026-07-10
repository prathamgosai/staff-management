import { Controller, Get, Post, Put, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { PredictionsService } from "./predictions.service";
import { RunPredictionDto, UpdateSalariesDto } from "./dto/prediction.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

/**
 * Staff Predictor (Feature 5). Run/history gated by predictions:run; role-salary management is
 * additionally restricted to Admin/HR inside the service.
 */
@ApiTags("Predictions")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class PredictionsController {
  constructor(private readonly service: PredictionsService) {}

  @Post("predictions")
  @RequirePermission("predictions:run")
  @ApiOperation({ summary: "Run the staff predictor for a planned outlet (persists the run)" })
  run(@CurrentUser() user: AuthUser, @Body() dto: RunPredictionDto) {
    return this.service.run(user, dto);
  }

  @Get("predictions")
  @RequirePermission("predictions:run")
  @ApiOperation({ summary: "Prediction history" })
  history(@CurrentUser() user: AuthUser) {
    return this.service.history(user);
  }

  @Get("settings/role-salaries")
  @RequirePermission("predictions:run")
  @ApiOperation({ summary: "Role average salaries (Admin/HR only)" })
  salaries(@CurrentUser() user: AuthUser) {
    return this.service.listSalaries(user);
  }

  @Put("settings/role-salaries")
  @RequirePermission("predictions:run")
  @ApiOperation({ summary: "Set role average salaries (Admin/HR only)" })
  updateSalaries(@CurrentUser() user: AuthUser, @Body() dto: UpdateSalariesDto) {
    return this.service.updateSalaries(user, dto);
  }
}
