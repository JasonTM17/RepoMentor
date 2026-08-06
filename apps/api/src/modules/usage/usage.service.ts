import { Inject, Injectable } from "@nestjs/common";

import {
  parseUsageQuotaConfig,
  USAGE_QUOTA_CONFIG,
  type UsageQuotaConfig,
} from "./usage.config.js";
import { getUtcDayWindow } from "./usage.date.js";
import {
  toUsageHistoryResponse,
  toUsageQuota,
  toUsageSummary,
  type UsageHistoryResponse,
  type UsageQuotaResponse,
  type UsageSummaryResponse,
} from "./usage.read-model.js";
import { USAGE_REPOSITORY, type UsageRepository } from "./usage.types.js";

@Injectable()
export class UsageService {
  constructor(
    @Inject(USAGE_REPOSITORY) private readonly repository: UsageRepository,
    @Inject(USAGE_QUOTA_CONFIG)
    private readonly quotaConfig: UsageQuotaConfig = parseUsageQuotaConfig(),
  ) {}

  async summary(userId: string, asOf = new Date()): Promise<UsageSummaryResponse> {
    const aggregate = await this.repository.getSummaryForUser(userId);
    return toUsageSummary(aggregate, asOf);
  }

  async history(userId: string, page: number, limit: number): Promise<UsageHistoryResponse> {
    const result = await this.repository.listHistoryForUser({ limit, page, userId });
    return toUsageHistoryResponse(result, page, limit);
  }

  async quota(userId: string, asOf = new Date()): Promise<UsageQuotaResponse> {
    const utcDay = getUtcDayWindow(asOf);
    const counts = await this.repository.countReviewsForUserOnUtcDay({
      endExclusive: utcDay.endExclusive,
      start: utcDay.start,
      userId,
    });

    return toUsageQuota(counts, this.quotaConfig, utcDay, asOf);
  }
}
