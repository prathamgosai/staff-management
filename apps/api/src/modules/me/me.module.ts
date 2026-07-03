import { Module } from "@nestjs/common";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";
import { LeaveModule } from "../leave/leave.module";

@Module({
  // Reuse LeaveService (balance-aware apply, balances, leave types) rather than
  // duplicating that logic in the self-service layer.
  imports: [LeaveModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
