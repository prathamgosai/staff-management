import { Injectable, Inject, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { istTodayStr } from "../../common/utils/date.util";
import { StaffingService } from "./staffing.service";

/**
 * Daily staffing-snapshot writer. At 01:30 IST it persists each outlet's per-role engine
 * output into staffing_snapshots (per tenant), powering the trend charts and pre-aggregated
 * dashboard. Idempotent (upsert on outlet+date+position) and safe to re-run.
 */
@Injectable()
export class StaffingScheduler {
  private readonly logger = new Logger("StaffingSnapshots");

  constructor(
    @Inject(DB_POOL) private readonly db: Pool,
    private readonly staffing: StaffingService,
  ) {}

  @Cron("30 1 * * *", { name: "staffing-snapshot", timeZone: "Asia/Kolkata" })
  async run(): Promise<void> {
    const date = istTodayStr();
    try {
      const tenants = await this.db.query("SELECT id FROM tenants WHERE is_active = true");
      let total = 0;
      for (const t of tenants.rows) {
        try {
          total += await this.staffing.writeSnapshots(t.id as string, date);
        } catch (e) {
          this.logger.error(`Snapshot failed for tenant ${t.id}: ${(e as Error).message}`);
        }
      }
      if (total) this.logger.log(`Staffing snapshots written for ${date}: ${total} role rows.`);
    } catch (e) {
      this.logger.error(`Staffing snapshot job failed: ${(e as Error).message}`);
    }
  }
}
