import type { AuditLogRecord, AuditLogRepository } from "./audit.types.js";

export class NoopAuditLogRepository implements AuditLogRepository {
  async create(record: AuditLogRecord): Promise<void> {
    void record;
  }
}
