import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { BullModule } from "@nestjs/bull";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
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
import { RolesModule } from "./modules/roles/roles.module";
import { MeModule } from "./modules/me/me.module";
import { PublicModule } from "./modules/public/public.module";
import { KioskModule } from "./modules/kiosk/kiosk.module";
import { DatabaseModule } from "./database/database.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: "../../.env" }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    // Global IP rate limit (generous default so the SPA isn't throttled); the
    // login route adds a much stricter per-IP limit (see auth.controller.ts).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>("REDIS_HOST", "localhost");
        // Managed Redis (e.g. Upstash) requires TLS. Enable it when REDIS_TLS=true
        // or the host is an Upstash endpoint; local dev Redis stays plaintext.
        const useTls =
          config.get<string>("REDIS_TLS") === "true" || host.endsWith(".upstash.io");
        return {
          redis: {
            host,
            port: config.get<number>("REDIS_PORT", 6379),
            password: config.get("REDIS_PASSWORD"),
            ...(useTls ? { tls: { servername: host } } : {}),
          },
        };
      },
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
    RolesModule,
    MeModule,
    PublicModule,
    KioskModule,
  ],
  providers: [
    // Apply rate limiting across the whole API.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
