import { Module } from "@nestjs/common";
import { TransferRecommendationsController } from "./transfer-recommendations.controller";
import { TransferRecommendationsService } from "./transfer-recommendations.service";
import { StaffingModule } from "../staffing/staffing.module";

@Module({
  imports: [StaffingModule], // reuses StaffingService.buildResults for live surplus/shortage
  controllers: [TransferRecommendationsController],
  providers: [TransferRecommendationsService],
})
export class TransferRecommendationsModule {}
