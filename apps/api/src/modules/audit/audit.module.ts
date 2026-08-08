import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuditLogService } from "./audit-log.service.js";
import {
  AUDIT_LOG_REPOSITORY,
  AUDIT_LOG_WRITE_TIMEOUT,
  DEFAULT_AUDIT_WRITE_TIMEOUT_MS,
} from "./audit.types.js";
import { NoopAuditLogRepository } from "./noop-audit-log.repository.js";
import { PrismaAuditLogRepository } from "./prisma-audit-log.repository.js";

function hasDatabaseConfiguration(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

@Module({
  imports: [AuthModule],
  providers: [
    AuditLogService,
    NoopAuditLogRepository,
    PrismaAuditLogRepository,
    {
      provide: AUDIT_LOG_REPOSITORY,
      inject: [NoopAuditLogRepository, PrismaAuditLogRepository],
      useFactory: (
        noopRepository: NoopAuditLogRepository,
        prismaRepository: PrismaAuditLogRepository,
      ) => (hasDatabaseConfiguration() ? prismaRepository : noopRepository),
    },
    {
      provide: AUDIT_LOG_WRITE_TIMEOUT,
      useValue: DEFAULT_AUDIT_WRITE_TIMEOUT_MS,
    },
  ],
  exports: [AuditLogService],
})
export class AuditModule {}
