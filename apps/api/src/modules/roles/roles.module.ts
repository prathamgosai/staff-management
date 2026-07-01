import { Module } from "@nestjs/common";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";

@Module({
  controllers: [RolesController],
  providers: [RolesService],
  // Exported so AuthModule can stamp live permissions onto the request user.
  exports: [RolesService],
})
export class RolesModule {}
