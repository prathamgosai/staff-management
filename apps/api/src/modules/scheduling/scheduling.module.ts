import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { SchedulingController } from "./scheduling.controller";
import { SchedulingService } from "./scheduling.service";
import { AutoScheduleProcessor } from "./processors/auto-schedule.processor";
import { RotationScheduler } from "./rotation.scheduler";
import { NotificationModule } from "../notification/notification.module";

@Module({
  imports: [
    BullModule.registerQueue({ name: "auto-schedule" }),
    NotificationModule,
  ],
  controllers: [SchedulingController],
  providers: [SchedulingService, AutoScheduleProcessor, RotationScheduler],
  exports: [SchedulingService],
})
export class SchedulingModule {}
