import { Injectable, Inject, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { Pool } from "pg";
import { DB_POOL } from "./database.constants";

/**
 * Keeps ONE database socket warm to the cross-region (Sydney) Supabase pooler.
 *
 * The external keep-warm pinger targets the DB-free /health route, so it keeps
 * the dyno awake but never keeps a DB connection open — and the pool reaps idle
 * sockets (idleTimeoutMillis). Without this, the first query after any lull
 * (typically the login SELECT) pays a full cross-region TCP+TLS+pooler-auth
 * reconnect. A tiny `SELECT 1` every 4 minutes (< the 5-minute idle timeout)
 * keeps a socket alive so that first query stays fast.
 *
 * Cheap and safe: SELECT 1 is idempotent, a failure is non-fatal (the next real
 * query just reconnects), and it holds at most one connection open.
 */
@Injectable()
export class DbKeepWarmService {
  private readonly logger = new Logger("DbKeepWarm");

  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  @Interval(240_000)
  async keepWarm(): Promise<void> {
    try {
      await this.pool.query("SELECT 1");
    } catch (err) {
      this.logger.debug(`keep-warm ping failed (non-fatal): ${(err as Error).message}`);
    }
  }
}
