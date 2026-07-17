import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { PredictionsService } from "./predictions.service";
import { RunPredictionDto } from "./dto/prediction.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

/**
 * Staff Predictor (Feature 5). Run/history gated by predictions:run. Role salaries still feed the
 * predictor's cost estimate from role_salary_configs, but are no longer editable over HTTP — the
 * Role salaries page and its GET/PUT endpoints were removed; update the table directly.
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

  @Get("predictions/outlet-baselines")
  @RequirePermission("predictions:run")
  @ApiOperation({ summary: "Existing outlets with peak pax + actual headcount, to compare predictions against" })
  outletBaselines(@CurrentUser() user: AuthUser) {
    return this.service.outletBaselines(user);
  }

}
