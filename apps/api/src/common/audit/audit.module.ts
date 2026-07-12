import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";

/**
 * Global so any service can inject AuditService without importing this module.
 * DB_POOL comes from the (also global) DatabaseModule.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
