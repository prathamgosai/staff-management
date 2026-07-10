import { Injectable, Inject, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";

/**
 * Daily document-expiry scan. Flips status → 'expired' for any active document whose
 * expiry has passed (IST day boundary). Idempotent and safe to re-run — a single set-based
 * UPDATE across all tenants, never per-request. Mirrors the rotation scheduler's IST @Cron.
 * `expires_on < (NOW() AT TIME ZONE 'Asia/Kolkata')::date` is timezone-correct regardless of
 * the DB session timezone (Render/Supabase default UTC).
 */
@Injectable()
export class DocumentExpiryScheduler {
  private readonly logger = new Logger("DocumentExpiry");

  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  @Cron("15 1 * * *", { name: "document-expiry-scan", timeZone: "Asia/Kolkata" })
  async scan(): Promise<void> {
    try {
      const res = await this.db.query(
        `UPDATE staff_documents
           SET status = 'expired'
         WHERE deleted_at IS NULL
           AND expires_on IS NOT NULL
           AND expires_on < (NOW() AT TIME ZONE 'Asia/Kolkata')::date
           AND status <> 'expired'`,
      );
      if (res.rowCount) this.logger.log(`Document expiry scan: marked ${res.rowCount} document(s) expired.`);
    } catch (e) {
      this.logger.error(`Document expiry scan failed: ${(e as Error).message}`);
    }
  }
}
