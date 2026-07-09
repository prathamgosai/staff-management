import { Module } from "@nestjs/common";
import { StaffDocumentsController } from "./staff-documents.controller";
import { StaffDocumentsService } from "./staff-documents.service";

@Module({
  controllers: [StaffDocumentsController],
  providers: [StaffDocumentsService],
  exports: [StaffDocumentsService], // MeModule reuses listOwn() for /me/documents
})
export class StaffDocumentsModule {}
