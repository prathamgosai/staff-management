import { Module } from "@nestjs/common";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";
import { LeaveModule } from "../leave/leave.module";
import { StaffDocumentsModule } from "../staff-documents/staff-documents.module";

@Module({
  // Reuse LeaveService (balance-aware apply, balances, leave types) and
  // StaffDocumentsService (own-document reads) rather than duplicating that logic.
  imports: [LeaveModule, StaffDocumentsModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
