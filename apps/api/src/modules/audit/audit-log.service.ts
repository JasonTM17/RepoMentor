import { Inject, Injectable, Optional } from "@nestjs/common";

import {
  AUDIT_LOG_REPOSITORY,
  AUDIT_LOG_WRITE_TIMEOUT,
  DEFAULT_AUDIT_WRITE_TIMEOUT_MS,
  normalizeAuditLogRecord,
  type AuditLogRecord,
  type AuditLogRepository,
} from "./audit.types.js";

@Injectable()
export class AuditLogService {
  private readonly writeTimeoutMs: number;

  constructor(
    @Inject(AUDIT_LOG_REPOSITORY) private readonly repository: AuditLogRepository,
    @Optional() @Inject(AUDIT_LOG_WRITE_TIMEOUT) writeTimeoutMs?: number,
  ) {
    this.writeTimeoutMs =
      typeof writeTimeoutMs === "number" && Number.isFinite(writeTimeoutMs)
        ? Math.max(1, Math.min(Math.floor(writeTimeoutMs), 5_000))
        : DEFAULT_AUDIT_WRITE_TIMEOUT_MS;
  }

  async record(record: AuditLogRecord): Promise<boolean> {
    const normalized = normalizeAuditLogRecord(record);

    if (!normalized) {
      return false;
    }

    try {
      await this.writeWithTimeout(normalized);
      return true;
    } catch {
      return false;
    }
  }

  private async writeWithTimeout(record: AuditLogRecord): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const write = Promise.resolve().then(() => this.repository.create(record));
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("audit log write timed out")), this.writeTimeoutMs);
    });

    try {
      await Promise.race([write, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
