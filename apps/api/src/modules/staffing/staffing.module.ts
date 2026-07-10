import { Module } from "@nestjs/common";
import { StaffingController } from "./staffing.controller";
import { StaffingDashboardController } from "./staffing-dashboard.controller";
import { StaffingService } from "./staffing.service";
import { StaffingScheduler } from "./staffing.scheduler";

@Module({
  controllers: [StaffingController, StaffingDashboardController],
  providers: [StaffingService, StaffingScheduler],
  exports: [StaffingService], // reused by Phase-4 transfer recommendations
})
export class StaffingModule {}
