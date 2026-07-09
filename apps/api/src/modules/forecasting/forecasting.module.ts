import { Module } from "@nestjs/common";
import { ForecastingController } from "./forecasting.controller";
import { PaxHistoryController } from "./pax-history.controller";
import { ForecastingService } from "./forecasting.service";
import { CapacityModule } from "../capacity/capacity.module";
import { SchedulingModule } from "../scheduling/scheduling.module";

@Module({
  imports: [CapacityModule, SchedulingModule], // covers-per-on-duty setting + roster coverage
  controllers: [ForecastingController, PaxHistoryController],
  providers: [ForecastingService],
  exports: [ForecastingService],
})
export class ForecastingModule {}
