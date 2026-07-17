import { Module } from "@nestjs/common";
import { CapacityService } from "./capacity.service";

@Module({
  providers: [CapacityService],
  exports: [CapacityService], // Tasks 3–5/7 (capacity analysis, planner, forecast) reuse this
})
export class CapacityModule {}
