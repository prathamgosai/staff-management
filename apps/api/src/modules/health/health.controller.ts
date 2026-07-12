import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";

/**
 * Liveness probe at GET /api/v1/health.
 *
 * DB-free on purpose: it must answer the instant the process is up, without
 * waiting on the (Sydney) database. That lets Render's own health check and any
 * external keep-warm pinger wake a sleeping free-tier dyno quickly. No auth guard
 * is applied (guards are opt-in across this API) and throttling is skipped so a
 * frequent pinger never trips the global rate limiter (429).
 */
@ApiTags("Health")
@Public()
@SkipThrottle()
@Controller("health")
export class HealthController {
  private readonly bootedAt = Date.now();

  @Get()
  @ApiOperation({ summary: "Liveness check (no auth, no DB) — used by keep-warm pingers" })
  check() {
    return {
      status: "ok",
      uptimeSeconds: Math.floor((Date.now() - this.bootedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}
