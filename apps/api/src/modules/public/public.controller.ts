import { Controller, Get, Param } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { PublicService } from "./public.service";

/**
 * Unauthenticated, hard-throttled read-only endpoints reached from WhatsApp magic links.
 * No JWT guard is applied (guards are opt-in), so this controller is open by design; the
 * global ThrottlerGuard plus the per-route @Throttle below rate-limit abuse, and every
 * invalid token yields a uniform 404.
 */
@ApiTags("Public")
@Controller("public")
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get("my-week/:token")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: "Read a magic-link roster (no auth; scoped entirely by the signed token)" })
  getMyWeek(@Param("token") token: string) {
    return this.publicService.getMyWeekByToken(token);
  }
}
