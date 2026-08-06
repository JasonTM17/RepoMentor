import type { ReviewMode, ReviewStatus } from "../review/review.types.js";

export const USAGE_REPOSITORY = Symbol("USAGE_REPOSITORY");

export interface UsageTokenRecord {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface UsageHistoryResultRecord {
  readonly durationMs: number;
  readonly usage: UsageTokenRecord | null;
}

export interface UsageHistoryRecord {
  readonly reviewId: string;
  readonly language: string;
  readonly mode: ReviewMode;
  readonly status: ReviewStatus;
  readonly createdAt: Date;
  readonly result: UsageHistoryResultRecord | null;
}

export interface UsageHistoryListInput {
  readonly userId: string;
  readonly page: number;
  readonly limit: number;
}

export interface UsageHistoryListResult {
  readonly items: readonly UsageHistoryRecord[];
  readonly total: number;
}

export interface UsageCountByStatus {
  readonly status: ReviewStatus;
  readonly count: number;
}

export interface UsageCountByLanguage {
  readonly language: string;
  readonly count: number;
}

export interface UsageCountByMode {
  readonly mode: ReviewMode;
  readonly count: number;
}

export interface UsageSummaryAggregate {
  readonly totalReviews: number;
  readonly statusCounts: readonly UsageCountByStatus[];
  readonly completedReviews: number;
  readonly deepReviews: number;
  readonly tokenTotals: UsageTokenRecord;
  readonly languageCounts: readonly UsageCountByLanguage[];
}

export interface UsageQuotaDayInput {
  readonly userId: string;
  readonly start: Date;
  readonly endExclusive: Date;
}

export interface UsageRepository {
  getSummaryForUser(userId: string): Promise<UsageSummaryAggregate>;
  listHistoryForUser(input: UsageHistoryListInput): Promise<UsageHistoryListResult>;
  countReviewsForUserOnUtcDay(input: UsageQuotaDayInput): Promise<readonly UsageCountByMode[]>;
}
