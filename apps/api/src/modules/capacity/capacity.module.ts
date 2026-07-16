import { Module } from "@nestjs/common";
import { PlanningController } from "./planning.controller";
import { CapacityService } from "./capacity.service";

@Module({
  controllers: [PlanningController],
  providers: [CapacityService],
  exports: [CapacityService], // Tasks 3–5/7 (capacity analysis, planner, forecast) reuse this
})
export class CapacityModule {}
