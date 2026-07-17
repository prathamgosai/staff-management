import { Module } from "@nestjs/common";
import { StaffingService } from "./staffing.service";
import { StaffingScheduler } from "./staffing.scheduler";

/**
 * No HTTP surface: the /staffing/requirements* and /dashboard/company-staffing
 * controllers were removed with the Company staffing page (7f472e5) — nothing
 * called them. What remains is the nightly StaffingScheduler snapshot writer.
 */
@Module({
  providers: [StaffingService, StaffingScheduler],
})
export class StaffingModule {}
