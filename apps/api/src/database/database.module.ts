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
          connectionTimeoutMillis: 2000,
        });
        pool.on("error", (err) => console.error("Unexpected PG pool error", err));
        return pool;
      },
    },
  ],
  exports: [DB_POOL],
})
export class DatabaseModule {}
