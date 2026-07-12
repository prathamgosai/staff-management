import { Module, Global, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import { DbKeepWarmService } from "./db-keepwarm.service";
import { DB_POOL } from "./database.constants";

export { DB_POOL };

// Connect-time network errors to the remote (Sydney) pooler. These fire BEFORE the
// query reaches the server, so retrying is safe and never double-executes a write.
const TRANSIENT_DB_ERRORS = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"]);

@Global()
@Module({
  providers: [
    {
      provide: DB_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger("Database");
        // Business timezone. The DB (Supabase) defaults its session to UTC, so
        // CURRENT_DATE / ::date / EXTRACT(DOW FROM ...) bucketed a just-after-IST-midnight
        // clock-in into the PREVIOUS day (and could collide the UNIQUE(staff_id, date) key).
        // Pin every pooled connection to IST so date bucketing matches the India business.
        const appTz = config.get<string>("APP_TZ", "Asia/Kolkata");
        // Log any single query slower than this (default 1.5s — above the ~470ms Sydney
        // baseline so it flags genuinely slow statements, not every round-trip).
        const slowMs = config.get<number>("DB_SLOW_QUERY_MS", 1500);
        const pool = new Pool({
          host: config.get("DB_HOST", "localhost"),
          port: config.get<number>("DB_PORT", 5432),
          database: config.get("DB_NAME", "workforceiq"),
          user: config.get("DB_USER", "workforceiq_user"),
          password: config.get("DB_PASSWORD"),
          ssl: config.get("DB_SSL") === "true" ? { rejectUnauthorized: false } : false,
          // Names this API in pg_stat_activity / the Supabase dashboard, so its
          // connections (and any runaway query) can be attributed and killed.
          application_name: "workforceiq-api",
          // Default MUST stay under the Supabase session-pooler cap (15 clients): if `max`
          // exceeds it, bursts of concurrent queries error with EMAXCONNSESSION instead of
          // queuing on the pool. 10 leaves headroom for the keep-warm socket + any stray
          // session. Deployments on a larger pooler/direct connection can raise DB_POOL_MAX.
          max: config.get<number>("DB_POOL_MAX", 10),
          // Cap any single query so a hung cross-region statement can't pin one of
          // the few (8 in prod) session-pooler connections indefinitely.
          // statement_timeout kills the backend server-side; query_timeout frees the
          // pool client. Default 30s is a safety net, not an SLA — bump
          // DB_STATEMENT_TIMEOUT_MS if a legitimately heavy op (e.g. schedule
          // generation) ever trips it.
          statement_timeout: config.get<number>("DB_STATEMENT_TIMEOUT_MS", 30000),
          query_timeout: config.get<number>("DB_STATEMENT_TIMEOUT_MS", 30000),
          // Hold idle sockets open long enough that the keep-warm SELECT 1 (every
          // ~4 min — see DbKeepWarmService) keeps at least one Sydney socket alive,
          // so the first login after a lull doesn't pay a full cross-region
          // TCP+TLS+pooler-auth reconnect. Tunable via env.
          idleTimeoutMillis: config.get<number>("DB_IDLE_TIMEOUT_MS", 300000),
          // Keep idle sockets alive so a NAT/firewall between here and the remote
          // pooler doesn't silently drop them — otherwise the next request pays a
          // full TLS reconnect to the (distant) database before it can even query.
          keepAlive: true,
          // Generous enough for a remote managed DB (e.g. Supabase pooler) where
          // TLS + cross-region latency can exceed a local socket's few ms.
          connectionTimeoutMillis: config.get<number>("DB_CONNECT_TIMEOUT_MS", 15000),
        });
        pool.on("error", (err) => logger.error(`Unexpected PG pool error: ${err.message}`));

        // Pin the session timezone on every new physical connection (E2). SET TIME ZONE
        // persists for the life of the pooled session, so all later CURRENT_DATE/::date
        // resolve in IST. Best-effort: a failure here must not take the connection down.
        pool.on("connect", (client) => {
          client.query(`SET TIME ZONE '${appTz}'`).catch((e) =>
            logger.warn(`Could not set session timezone to ${appTz}: ${(e as Error).message}`),
          );
        });

        // Survive a transient DNS/connect blip to the remote DB: a single failed
        // getaddrinfo (ENOTFOUND) otherwise 500s the request (e.g. login) even though
        // the DB is fine a second later. Bounded to 3 quick attempts; only connect-time
        // errors are retried, so a write is never re-executed.
        const originalQuery = pool.query.bind(pool);
        pool.query = ((...args: unknown[]) => {
          // Callback form (last arg is a function) — pass straight through, no retry.
          if (typeof args[args.length - 1] === "function") {
            return (originalQuery as (...a: unknown[]) => unknown)(...args);
          }
          const startedAt = Date.now();
          const sqlText =
            typeof args[0] === "string" ? args[0] : (args[0] as { text?: string })?.text ?? "";
          const logIfSlow = () => {
            const ms = Date.now() - startedAt;
            if (ms >= slowMs) {
              // First line of the statement, whitespace-collapsed — enough to identify it
              // without dumping a multi-line query (or any bound parameter values).
              const preview = sqlText.replace(/\s+/g, " ").trim().slice(0, 120);
              logger.warn(`Slow query ${ms}ms: ${preview}`);
            }
          };
          return (async () => {
            let lastErr: unknown;
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                const res = await (originalQuery as (...a: unknown[]) => Promise<unknown>)(...args);
                logIfSlow();
                return res;
              } catch (e) {
                lastErr = e;
                const code = (e as { code?: string })?.code;
                if (attempt === 3 || !code || !TRANSIENT_DB_ERRORS.has(code)) throw e;
                logger.warn(`DB ${code} — retrying (${attempt}/2) in ${250 * attempt}ms`);
                await new Promise((r) => setTimeout(r, 250 * attempt));
              }
            }
            throw lastErr;
          })();
        }) as typeof pool.query;

        return pool;
      },
    },
    DbKeepWarmService,
  ],
  exports: [DB_POOL],
})
export class DatabaseModule {}
