import { Module, Global, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";

export const DB_POOL = "DB_POOL";

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
        const pool = new Pool({
          host: config.get("DB_HOST", "localhost"),
          port: config.get<number>("DB_PORT", 5432),
          database: config.get("DB_NAME", "workforceiq"),
          user: config.get("DB_USER", "workforceiq_user"),
          password: config.get("DB_PASSWORD"),
          ssl: config.get("DB_SSL") === "true" ? { rejectUnauthorized: false } : false,
          max: config.get<number>("DB_POOL_MAX", 20),
          idleTimeoutMillis: 30000,
          // Keep idle sockets alive so a NAT/firewall between here and the remote
          // pooler doesn't silently drop them — otherwise the next request pays a
          // full TLS reconnect to the (distant) database before it can even query.
          keepAlive: true,
          // Generous enough for a remote managed DB (e.g. Supabase pooler) where
          // TLS + cross-region latency can exceed a local socket's few ms.
          connectionTimeoutMillis: config.get<number>("DB_CONNECT_TIMEOUT_MS", 15000),
        });
        pool.on("error", (err) => logger.error(`Unexpected PG pool error: ${err.message}`));

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
          return (async () => {
            let lastErr: unknown;
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                return await (originalQuery as (...a: unknown[]) => Promise<unknown>)(...args);
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
  ],
  exports: [DB_POOL],
})
export class DatabaseModule {}
