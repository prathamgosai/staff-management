import { Module } from "@nestjs/common";
import { OutletController } from "./outlet.controller";
import { OutletService } from "./outlet.service";
import { CapacityModule } from "../capacity/capacity.module";

@Module({
  imports: [CapacityModule], // OutletController serves GET /outlets/capacity-analysis
  controllers: [OutletController],
  providers: [OutletService],
  exports: [OutletService],
})
export class OutletModule {}
