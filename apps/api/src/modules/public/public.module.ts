import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";
import { MagicLinkService } from "./magic-link.service";

// JwtModule.register({}) with no secret — the magic-link secret is passed per-call so it
// stays independent of the app's JWT_SECRET. MagicLinkService is exported for the
// notification dispatch worker to mint links in the ROSTER_PUBLISHED path.
@Module({
  imports: [JwtModule.register({})],
  controllers: [PublicController],
  providers: [PublicService, MagicLinkService],
  exports: [MagicLinkService],
})
export class PublicModule {}
