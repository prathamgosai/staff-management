import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { AuditController } from "./audit.controller";

/**
 * Global so any service can inject AuditService without importing this module.
 * DB_POOL comes from the (also global) DatabaseModule. Also hosts the read-only
 * GET /audit controller (the "who changed what" trail).
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
