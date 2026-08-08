import type { AuditLogRecord, AuditLogRepository } from "./audit.types.js";

export class InMemoryAuditLogRepository implements AuditLogRepository {
  private readonly records: AuditLogRecord[] = [];

  async create(record: AuditLogRecord): Promise<void> {
    this.records.push({ ...record });
  }

  getEntries(): readonly AuditLogRecord[] {
    return this.records.map((record) => ({ ...record }));
  }
}
