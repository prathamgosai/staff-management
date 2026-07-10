import { Module } from "@nestjs/common";
import { RestaurantConfigController } from "./restaurant-config.controller";
import { RestaurantSettingsController } from "./restaurant-settings.controller";
import { RestaurantConfigService } from "./restaurant-config.service";

@Module({
  controllers: [RestaurantConfigController, RestaurantSettingsController],
  providers: [RestaurantConfigService],
  exports: [RestaurantConfigService], // reused by the Phase-3 staffing engine
})
export class RestaurantConfigModule {}
