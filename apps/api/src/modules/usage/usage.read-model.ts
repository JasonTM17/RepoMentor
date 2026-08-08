import {
  REVIEW_MODES,
  REVIEW_STATUSES,
  type ReviewMode,
  type ReviewStatus,
} from "../review/review.types.js";
import type { UsageQuotaConfig } from "./usage.config.js";
import type { UtcDayWindow } from "./usage.date.js";
import {
  USAGE_COST_STATUSES,
  type UsageCountByLanguage,
  type UsageCountByMode,
  type UsageCostStatus,
  type UsageHistoryListResult,
  type UsageHistoryRecord,
  type UsageSummaryAggregate,
} from "./usage.types.js";

export const USAGE_MAX_HISTORY_PAGE_SIZE = 50;
export const USAGE_MAX_HISTORY_PAGE_NUMBER = 10_000;
export const USAGE_MAX_HISTORY_SEARCH_LENGTH = 25;

export interface UsageStatusCounts {
  readonly PENDING: number;
  readonly PROCESSING: number;
  readonly COMPLETED: number;
  readonly FAILED: number;
  readonly CANCELLED: number;
}

type MutableUsageStatusCounts = {
  -readonly [Key in keyof UsageStatusCounts]: number;
};

export interface UsageLanguageDistribution {
  readonly language: string;
  readonly count: number;
}

export interface UsageSummaryResponse {
  readonly costStatus: UsageCostStatus;
  readonly estimatedCostMicros: number | null;
  readonly totalReviews: number;
  readonly reviewsByStatus: UsageStatusCounts;
  readonly completedReviews: number;
  readonly deepReviews: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly pricingVersion: string | null;
  readonly totalTokens: number;
  readonly languageDistribution: readonly UsageLanguageDistribution[];
  readonly asOf: string;
}

export interface UsageHistoryItem {
  readonly reviewId: string;
  readonly language: string;
  readonly mode: ReviewMode;
  readonly status: ReviewStatus;
  readonly estimatedCostMicros: number | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly pricingVersion: string | null;
  readonly totalTokens: number | null;
  readonly durationMs: number | null;
  readonly createdAt: string;
}

export interface UsageHistoryMeta {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

export interface UsageHistoryResponse {
  readonly items: readonly UsageHistoryItem[];
  readonly meta: UsageHistoryMeta;
}

export interface UsageQuotaMode {
  readonly limit: number;
  readonly used: number;
  readonly remaining: number;
}

export interface UsageQuotaResponse {
  readonly utcDay: string;
  readonly modes: Readonly<Record<ReviewMode, UsageQuotaMode>>;
  readonly asOf: string;
}

export const MAX_USAGE_INTEGER = Number.MAX_SAFE_INTEGER;

export function toBoundedNonNegativeInteger(value: unknown): number {
  if (typeof value === "bigint") {
    if (value <= 0n) {
      return 0;
    }

    return value > BigInt(MAX_USAGE_INTEGER) ? MAX_USAGE_INTEGER : Number(value);
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.min(Math.floor(value), MAX_USAGE_INTEGER);
}

function toNullableBoundedNonNegativeInteger(value: unknown): number | null {
  return value === null || value === undefined ? null : toBoundedNonNegativeInteger(value);
}

function isUsageCostStatus(value: string): value is UsageCostStatus {
  return (USAGE_COST_STATUSES as readonly string[]).includes(value);
}

function normalizePricingVersion(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(value)
    ? value
    : null;
}

export function addBoundedNonNegativeIntegers(left: unknown, right: unknown): number {
  const safeLeft = toBoundedNonNegativeInteger(left);
  const safeRight = toBoundedNonNegativeInteger(right);

  return safeLeft > MAX_USAGE_INTEGER - safeRight ? MAX_USAGE_INTEGER : safeLeft + safeRight;
}

function normalizeLanguage(language: string): string {
  return language.trim().toLowerCase();
}

function isReviewStatus(value: string): value is ReviewStatus {
  return (REVIEW_STATUSES as readonly string[]).includes(value);
}

function isReviewMode(value: string): value is ReviewMode {
  return (REVIEW_MODES as readonly string[]).includes(value);
}

function emptyStatusCounts(): MutableUsageStatusCounts {
  return {
    CANCELLED: 0,
    COMPLETED: 0,
    FAILED: 0,
    PENDING: 0,
    PROCESSING: 0,
  };
}

function mapLanguageCounts(counts: readonly UsageCountByLanguage[]): UsageLanguageDistribution[] {
  const merged = new Map<string, number>();

  for (const item of counts) {
    const language = normalizeLanguage(item.language);
    merged.set(language, addBoundedNonNegativeIntegers(merged.get(language), item.count));
  }

  return [...merged.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([language, count]) => ({ count, language }));
}

export function toUsageSummary(aggregate: UsageSummaryAggregate, asOf: Date): UsageSummaryResponse {
  const reviewsByStatus = emptyStatusCounts();

  for (const item of aggregate.statusCounts) {
    if (isReviewStatus(item.status)) {
      reviewsByStatus[item.status] = addBoundedNonNegativeIntegers(
        reviewsByStatus[item.status],
        item.count,
      );
    }
  }

  return {
    asOf: asOf.toISOString(),
    completedReviews: toBoundedNonNegativeInteger(aggregate.completedReviews),
    costStatus: isUsageCostStatus(aggregate.cost.status) ? aggregate.cost.status : "UNAVAILABLE",
    deepReviews: toBoundedNonNegativeInteger(aggregate.deepReviews),
    estimatedCostMicros:
      aggregate.cost.status === "AVAILABLE"
        ? toNullableBoundedNonNegativeInteger(aggregate.cost.estimatedCostMicros)
        : null,
    inputTokens: toBoundedNonNegativeInteger(aggregate.tokenTotals.inputTokens),
    languageDistribution: mapLanguageCounts(aggregate.languageCounts),
    outputTokens: toBoundedNonNegativeInteger(aggregate.tokenTotals.outputTokens),
    reviewsByStatus,
    pricingVersion:
      aggregate.cost.status === "AVAILABLE"
        ? normalizePricingVersion(aggregate.cost.pricingVersion)
        : null,
    totalReviews: toBoundedNonNegativeInteger(aggregate.totalReviews),
    totalTokens: toBoundedNonNegativeInteger(aggregate.tokenTotals.totalTokens),
  };
}

export function toUsageHistoryItem(record: UsageHistoryRecord): UsageHistoryItem {
  const usage = record.result?.usage;

  return {
    createdAt: record.createdAt.toISOString(),
    durationMs:
      record.result === null ? null : toBoundedNonNegativeInteger(record.result.durationMs),
    inputTokens:
      usage === null || usage === undefined ? null : toBoundedNonNegativeInteger(usage.inputTokens),
    language: normalizeLanguage(record.language),
    mode: record.mode,
    outputTokens:
      usage === null || usage === undefined
        ? null
        : toBoundedNonNegativeInteger(usage.outputTokens),
    estimatedCostMicros:
      usage === null || usage === undefined
        ? null
        : toNullableBoundedNonNegativeInteger(usage.estimatedCostMicros),
    pricingVersion:
      usage === null || usage === undefined ? null : normalizePricingVersion(usage.pricingVersion),
    reviewId: record.reviewId,
    status: record.status,
    totalTokens:
      usage === null || usage === undefined ? null : toBoundedNonNegativeInteger(usage.totalTokens),
  };
}

export function toUsageHistoryResponse(
  result: UsageHistoryListResult,
  page: number,
  limit: number,
): UsageHistoryResponse {
  const total = toBoundedNonNegativeInteger(result.total);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    items: result.items.map(toUsageHistoryItem),
    meta: {
      hasNext: page < totalPages,
      hasPrevious: page > 1 && totalPages > 0,
      limit,
      page,
      total,
      totalPages,
    },
  };
}

function emptyModeCounts(): Record<ReviewMode, number> {
  return { DEEP: 0, QUICK: 0, STANDARD: 0 };
}

export function toUsageQuota(
  counts: readonly UsageCountByMode[],
  config: UsageQuotaConfig,
  utcDay: UtcDayWindow,
  asOf: Date,
): UsageQuotaResponse {
  const usedByMode = emptyModeCounts();

  for (const item of counts) {
    if (isReviewMode(item.mode)) {
      usedByMode[item.mode] = addBoundedNonNegativeIntegers(usedByMode[item.mode], item.count);
    }
  }

  const modes = {} as Record<ReviewMode, UsageQuotaMode>;

  for (const mode of REVIEW_MODES) {
    const limit = toBoundedNonNegativeInteger(config.dailyLimits[mode]);
    const used = usedByMode[mode];

    modes[mode] = {
      limit,
      remaining: Math.max(0, limit - used),
      used,
    };
  }

  return {
    asOf: asOf.toISOString(),
    modes,
    utcDay: utcDay.day,
  };
}
