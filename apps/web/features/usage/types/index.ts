export type UsageReviewStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type UsageReviewMode = "QUICK" | "STANDARD" | "DEEP";

export interface UsageStatusCounts {
  readonly PENDING: number;
  readonly PROCESSING: number;
  readonly COMPLETED: number;
  readonly FAILED: number;
  readonly CANCELLED: number;
}

export interface UsageLanguageDistribution {
  readonly language: string;
  readonly count: number;
}

export interface UsageSummaryData {
  readonly totalReviews: number;
  readonly reviewsByStatus: UsageStatusCounts;
  readonly completedReviews: number;
  readonly deepReviews: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly languageDistribution: readonly UsageLanguageDistribution[];
  readonly asOf: string;
}

export interface UsageHistoryItem {
  readonly reviewId: string;
  readonly language: string;
  readonly mode: UsageReviewMode;
  readonly status: UsageReviewStatus;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
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

export interface UsageHistoryData {
  readonly items: readonly UsageHistoryItem[];
  readonly meta: UsageHistoryMeta;
}

export interface UsageHistoryRequest {
  readonly page: number;
  readonly limit: number;
}

export interface UsageQuotaMode {
  readonly limit: number;
  readonly used: number;
  readonly remaining: number;
}

export interface UsageQuotaData {
  readonly utcDay: string;
  readonly modes: Readonly<Record<UsageReviewMode, UsageQuotaMode>>;
  readonly asOf: string;
}

export interface UsageTransport {
  readonly source: "api" | "demo";
  readonly fixtureHistory?: readonly UsageHistoryItem[];
  readonly getSummary: () => Promise<UsageSummaryData>;
  readonly getHistory: (request: UsageHistoryRequest) => Promise<UsageHistoryData>;
  readonly getQuota: () => Promise<UsageQuotaData>;
}

export type UsageResourceStatus = "loading" | "success" | "error";

export interface UsageDashboardData {
  readonly summary: UsageSummaryData;
  readonly history: UsageHistoryData;
  readonly quota: UsageQuotaData;
}

export interface UsageOverviewData {
  readonly summary: UsageSummaryData;
  readonly quota: UsageQuotaData;
}

export interface UsageResourceState<TData> {
  readonly data: TData | null;
  readonly errorMessage: string | null;
  readonly status: UsageResourceStatus;
}

export interface UsageHistoryFilters {
  readonly language: string;
  readonly mode: UsageReviewMode | "ALL";
  readonly status: UsageReviewStatus | "ALL";
}
