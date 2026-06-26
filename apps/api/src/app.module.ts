import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { BullModule } from "@nestjs/bull";
import { AuthModule } from "./modules/auth/auth.module";
import { StaffModule } from "./modules/staff/staff.module";
import { OutletModule } from "./modules/outlet/outlet.module";
import { DepartmentModule } from "./modules/department/department.module";
import { SchedulingModule } from "./modules/scheduling/scheduling.module";
import { AttendanceModule } from "./modules/attendance/attendance.module";
import { LeaveModule } from "./modules/leave/leave.module";
import { ForecastingModule } from "./modules/forecasting/forecasting.module";
import { AllocationModule } from "./modules/allocation/allocation.module";
import { NotificationModule } from "./modules/notification/notification.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { DatabaseModule } from "./database/database.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: "../../.env" }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get("REDIS_HOST", "localhost"),
          port: config.get<number>("REDIS_PORT", 6379),
          password: config.get("REDIS_PASSWORD"),
        },
      }),
    }),
    DatabaseModule,
    AuthModule,
    StaffModule,
    OutletModule,
    DepartmentModule,
    SchedulingModule,
    AttendanceModule,
    LeaveModule,
    ForecastingModule,
    AllocationModule,
    NotificationModule,
    DashboardModule,
  ],
})
export class AppModule {}
