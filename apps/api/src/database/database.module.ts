import { Module, Global } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";

export const DB_POOL = "DB_POOL";

@Global()
@Module({
  providers: [
    {
      provide: DB_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
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
        pool.on("error", (err) => console.error("Unexpected PG pool error", err));
        return pool;
      },
    },
  ],
  exports: [DB_POOL],
})
export class DatabaseModule {}
