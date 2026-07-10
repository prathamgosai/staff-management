import { Module } from "@nestjs/common";
import { StaffDocumentsController } from "./staff-documents.controller";
import { DocumentsController } from "./documents.controller";
import { DocumentTypesController } from "./document-types.controller";
import { StaffDocumentsService } from "./staff-documents.service";
import { DocumentCryptoService } from "./document-crypto.service";
import { DocumentStorageService } from "./document-storage.service";
import { DocumentExpiryScheduler } from "./document-expiry.scheduler";

@Module({
  controllers: [StaffDocumentsController, DocumentsController, DocumentTypesController],
  providers: [
    StaffDocumentsService,
    DocumentCryptoService,
    DocumentStorageService,
    DocumentExpiryScheduler,
  ],
  exports: [StaffDocumentsService], // MeModule reuses listOwn() for /me/documents
})
export class StaffDocumentsModule {}
