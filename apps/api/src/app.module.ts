import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { BullModule } from "@nestjs/bull";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { AuthModule } from "./modules/auth/auth.module";
import { StaffModule } from "./modules/staff/staff.module";
import { StaffDocumentsModule } from "./modules/staff-documents/staff-documents.module";
import { OutletModule } from "./modules/outlet/outlet.module";
import { CapacityModule } from "./modules/capacity/capacity.module";
import { RestaurantConfigModule } from "./modules/restaurant-config/restaurant-config.module";
import { StaffingModule } from "./modules/staffing/staffing.module";
import { PredictionsModule } from "./modules/predictions/predictions.module";
import { TransferRecommendationsModule } from "./modules/transfer-recommendations/transfer-recommendations.module";
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
import { HealthModule } from "./modules/health/health.module";
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
    StaffDocumentsModule,
    OutletModule,
    CapacityModule,
    RestaurantConfigModule,
    StaffingModule,
    PredictionsModule,
    TransferRecommendationsModule,
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
    HealthModule,
  ],
  providers: [
    // Apply rate limiting across the whole API.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Fail-CLOSED authentication: require a valid JWT on every route unless it is
    // explicitly marked @Public(). Previously auth was opt-in per controller, so any
    // handler that forgot @UseGuards(JwtAuthGuard) shipped silently unauthenticated.
    // Runs after ThrottlerGuard and before controller/route guards, so it populates
    // request.user before PermissionsGuard/RolesGuard evaluate. Permission + outlet
    // resolution is in-memory-cached (RolesService), so this adds no DB round-trip
    // even where an explicit JwtAuthGuard also remains on the controller.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
