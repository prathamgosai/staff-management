import { Injectable, Inject, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { SchedulingService } from "./scheduling.service";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const SYSTEM_USER_ID = "50000000-0000-0000-0000-000000000001"; // admin user

/**
 * Produce a readable message for any error. An AggregateError (e.g. the pg Pool
 * failing to connect to a Postgres that isn't running — ECONNREFUSED on both
 * ::1 and 127.0.0.1) has an empty `.message`, which would otherwise log as a
 * blank line. Surface the underlying errors so the failure is diagnosable.
 */
function formatError(e: unknown): string {
  if (e instanceof AggregateError) {
    const inner = e.errors
      .map((x) => (x instanceof Error ? x.message : String(x)))
      .join("; ");
    return `${e.message || "AggregateError"} [${inner}]`;
  }
  return e instanceof Error ? e.message : String(e);
}

@Injectable()
export class RotationScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(RotationScheduler.name);

  constructor(
    @Inject(DB_POOL) private readonly db: Pool,
    private readonly schedulingService: SchedulingService,
  ) {}

  /** Run on app start — generate current week's schedule for any outlet that doesn't have one yet */
  async onApplicationBootstrap() {
    setTimeout(() => this.generateMissingSchedules(), 5000);
  }

  /** Every Monday at 00:05 AM — auto-generate next week's rotation for all outlets */
  @Cron("5 0 * * 1", { name: "weekly-rotation", timeZone: "Asia/Kolkata" })
  async runWeeklyRotation() {
    this.logger.log("⏰ Weekly rotation cron started");
    await this.generateForWeek(this.getMondayStr(new Date()));
  }

  /** Also generate for THIS week on startup so the dashboard shows data immediately */
  private async generateMissingSchedules() {
    const thisMonday = this.getMondayStr(new Date());
    this.logger.log(`🔄 Checking schedules for week of ${thisMonday}…`);

    try {
      const outlets = await this.db.query(
        "SELECT id FROM outlets WHERE tenant_id = $1 AND is_active = true",
        [TENANT_ID],
      );

      let generated = 0;
      for (const outlet of outlets.rows) {
        // Check if schedule already exists for this week
        const existing = await this.db.query(
          "SELECT id FROM schedules WHERE outlet_id = $1 AND week_start_date = $2",
          [outlet.id, thisMonday],
        );
        if (!existing.rows[0]) {
          try {
            await this.schedulingService.autoGenerateRotation(TENANT_ID, outlet.id, thisMonday, SYSTEM_USER_ID);
            generated++;
          } catch (e) {
            this.logger.warn(`Could not generate for outlet ${outlet.id}: ${formatError(e)}`);
          }
        }
      }

      if (generated > 0) {
        this.logger.log(`✅ Auto-generated ${generated} missing schedules for current week`);
      } else {
        this.logger.log("✅ All outlet schedules already exist for this week");
      }
    } catch (e) {
      // Never let a startup DB error become an unhandled rejection that crashes the process.
      // Most common cause here: backing services (Postgres/Redis) not started — run
      // `.\start-services.ps1` before `pnpm dev`. See formatError() above.
      this.logger.error(`Startup schedule check failed: ${formatError(e)}`);
    }
  }

  private async generateForWeek(mondayStr: string) {
    const outlets = await this.db.query(
      "SELECT id, name FROM outlets WHERE tenant_id = $1 AND is_active = true",
      [TENANT_ID],
    );
    let ok = 0;
    for (const outlet of outlets.rows) {
      try {
        await this.schedulingService.autoGenerateRotation(TENANT_ID, outlet.id, mondayStr, SYSTEM_USER_ID);
        ok++;
      } catch (e) {
        this.logger.warn(`Rotation failed for ${outlet.name}: ${formatError(e)}`);
      }
    }
    this.logger.log(`✅ Weekly rotation complete: ${ok}/${outlets.rows.length} outlets scheduled for ${mondayStr}`);
  }

  private getMondayStr(date: Date): string {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sun, 1=Mon
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split("T")[0];
  }
}
