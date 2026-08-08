import { Injectable } from "@nestjs/common";

import { PrismaService } from "../auth/prisma.service.js";
import type { AuditLogRecord, AuditLogRepository } from "./audit.types.js";

@Injectable()
export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(record: AuditLogRecord): Promise<void> {
    await this.prisma.transaction(async (transaction) => {
      await transaction.auditLog.create({
        data: {
          action: record.action,
          actorType: record.actorType,
          method: record.method,
          occurredAt: record.occurredAt,
          outcome: record.outcome,
          requestId: record.requestId,
          route: record.route,
          statusCode: record.statusCode,
          ...(record.sessionId === undefined ? {} : { sessionId: record.sessionId }),
          ...(record.targetId === undefined ? {} : { targetId: record.targetId }),
          ...(record.userId === undefined ? {} : { userId: record.userId }),
        },
      });
    });
  }
}
