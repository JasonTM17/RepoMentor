import type {
  UsageHistoryData,
  UsageHistoryItem,
  UsageHistoryRequest,
  UsageQuotaData,
  UsageQuotaMode,
  UsageReviewMode,
  UsageReviewStatus,
  UsageStatusCounts,
  UsageSummaryData,
  UsageTransport,
} from "@/features/usage/types";

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/+$/u, "") ?? "";
const maxHistoryPageSize = 50;
const maxHistoryPageNumber = 10_000;
const maxPageSize = 100;
const maxLanguageLength = 32;
const maxReviewIdLength = 256;
const maxRequestIdLength = 128;

export class UsageApiError extends Error {
  public readonly code: string | undefined;
  public readonly status: number;

  public constructor(status: number, code?: string) {
    super("The usage transport could not complete the request.");
    this.name = "UsageApiError";
    this.code = code;
    this.status = status;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => hasOwn(value, key));

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const isNonBlankString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isBoundedString = (value: unknown, maximum: number): value is string =>
  isNonBlankString(value) && value.length <= maximum && value === value.trim();

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isoDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

const isIsoDateTime = (value: unknown): value is string =>
  typeof value === "string" && isoDateTimePattern.test(value) && !Number.isNaN(Date.parse(value));

const usageModes: readonly UsageReviewMode[] = ["QUICK", "STANDARD", "DEEP"];
const usageStatuses: readonly UsageReviewStatus[] = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

const isUsageMode = (value: unknown): value is UsageReviewMode =>
  typeof value === "string" && usageModes.includes(value as UsageReviewMode);

const isUsageStatus = (value: unknown): value is UsageReviewStatus =>
  typeof value === "string" && usageStatuses.includes(value as UsageReviewStatus);

const isUsageStatusCounts = (value: unknown): value is UsageStatusCounts => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"])
  ) {
    return false;
  }

  return Object.values(value).every(isNonNegativeInteger);
};

const isLanguageDistribution = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      isRecord(item) &&
      hasExactKeys(item, ["language", "count"]) &&
      isBoundedString(item.language, maxLanguageLength) &&
      isNonNegativeInteger(item.count),
  );

const isUsageSummaryData = (value: unknown): value is UsageSummaryData =>
  isRecord(value) &&
  hasExactKeys(value, [
    "totalReviews",
    "reviewsByStatus",
    "completedReviews",
    "deepReviews",
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "languageDistribution",
    "asOf",
  ]) &&
  isNonNegativeInteger(value.totalReviews) &&
  isUsageStatusCounts(value.reviewsByStatus) &&
  isNonNegativeInteger(value.completedReviews) &&
  isNonNegativeInteger(value.deepReviews) &&
  isNonNegativeInteger(value.inputTokens) &&
  isNonNegativeInteger(value.outputTokens) &&
  isNonNegativeInteger(value.totalTokens) &&
  value.totalTokens === value.inputTokens + value.outputTokens &&
  isLanguageDistribution(value.languageDistribution) &&
  isIsoDateTime(value.asOf);

const isNullableNonNegativeInteger = (value: unknown): value is number | null =>
  value === null || isNonNegativeInteger(value);

const isUsageHistoryItem = (value: unknown): value is UsageHistoryItem => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "reviewId",
      "language",
      "mode",
      "status",
      "inputTokens",
      "outputTokens",
      "totalTokens",
      "durationMs",
      "createdAt",
    ])
  ) {
    return false;
  }

  const usageFieldsAreAllNull =
    value.inputTokens === null && value.outputTokens === null && value.totalTokens === null;
  const usageFieldsAreComplete =
    isNonNegativeInteger(value.inputTokens) &&
    isNonNegativeInteger(value.outputTokens) &&
    isNonNegativeInteger(value.totalTokens) &&
    value.totalTokens === value.inputTokens + value.outputTokens;

  return (
    isBoundedString(value.reviewId, maxReviewIdLength) &&
    isBoundedString(value.language, maxLanguageLength) &&
    isUsageMode(value.mode) &&
    isUsageStatus(value.status) &&
    isNullableNonNegativeInteger(value.inputTokens) &&
    isNullableNonNegativeInteger(value.outputTokens) &&
    isNullableNonNegativeInteger(value.totalTokens) &&
    (usageFieldsAreAllNull || usageFieldsAreComplete) &&
    isNullableNonNegativeInteger(value.durationMs) &&
    isIsoDateTime(value.createdAt)
  );
};

const isUsageHistoryMeta = (value: unknown): boolean =>
  isRecord(value) &&
  hasExactKeys(value, ["page", "limit", "total", "totalPages", "hasNext", "hasPrevious"]) &&
  typeof value.page === "number" &&
  Number.isSafeInteger(value.page) &&
  value.page > 0 &&
  typeof value.limit === "number" &&
  Number.isSafeInteger(value.limit) &&
  value.limit > 0 &&
  value.limit <= maxHistoryPageSize &&
  isNonNegativeInteger(value.total) &&
  isNonNegativeInteger(value.totalPages) &&
  typeof value.hasNext === "boolean" &&
  typeof value.hasPrevious === "boolean";

const isUsageHistoryData = (value: unknown): value is UsageHistoryData =>
  isRecord(value) &&
  hasExactKeys(value, ["items", "meta"]) &&
  Array.isArray(value.items) &&
  value.items.every(isUsageHistoryItem) &&
  isUsageHistoryMeta(value.meta);

const isUsageQuotaMode = (value: unknown): value is UsageQuotaMode =>
  isRecord(value) &&
  hasExactKeys(value, ["limit", "used", "remaining"]) &&
  isNonNegativeInteger(value.limit) &&
  isNonNegativeInteger(value.used) &&
  isNonNegativeInteger(value.remaining) &&
  value.remaining === Math.max(0, value.limit - value.used);

const isUtcDay = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value);

const isUsageQuotaData = (value: unknown): value is UsageQuotaData => {
  const modes = isRecord(value) ? value.modes : undefined;

  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["utcDay", "modes", "asOf"]) ||
    !isUtcDay(value.utcDay) ||
    !isIsoDateTime(value.asOf) ||
    !isRecord(modes) ||
    !hasExactKeys(modes, usageModes)
  ) {
    return false;
  }

  return usageModes.every((mode) => isUsageQuotaMode(modes[mode]));
};

interface UsageApiMeta {
  readonly requestId?: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly total?: number;
}

interface UsageSuccessEnvelope {
  readonly data: unknown;
  readonly meta?: UsageApiMeta;
}

const isApiMeta = (value: unknown): value is UsageApiMeta => {
  if (!isRecord(value) || !hasOnlyKeys(value, ["requestId", "page", "pageSize", "total"])) {
    return false;
  }

  return (
    (!hasOwn(value, "requestId") || isBoundedString(value.requestId, maxRequestIdLength)) &&
    (!hasOwn(value, "page") ||
      (typeof value.page === "number" && Number.isSafeInteger(value.page) && value.page > 0)) &&
    (!hasOwn(value, "pageSize") ||
      (typeof value.pageSize === "number" &&
        Number.isSafeInteger(value.pageSize) &&
        value.pageSize > 0 &&
        value.pageSize <= maxPageSize)) &&
    (!hasOwn(value, "total") ||
      (typeof value.total === "number" && Number.isSafeInteger(value.total) && value.total >= 0))
  );
};

const isSuccessEnvelope = (value: unknown): value is UsageSuccessEnvelope =>
  isRecord(value) &&
  hasOwn(value, "data") &&
  hasOnlyKeys(value, ["data", "meta"]) &&
  (!hasOwn(value, "meta") || isApiMeta(value.meta));

const readErrorCode = (value: unknown): string | undefined => {
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.code !== "string") {
    return undefined;
  }

  return value.error.code;
};

const request = async <TResponse>(
  path: string,
  isResponse: (value: unknown) => value is TResponse,
): Promise<TResponse> => {
  let response: Response;

  try {
    response = await fetch(`${apiOrigin}${path}`, { credentials: "include", method: "GET" });
  } catch {
    throw new UsageApiError(0);
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    throw new UsageApiError(response.status, readErrorCode(body));
  }

  if (!isSuccessEnvelope(body) || !isResponse(body.data)) {
    throw new UsageApiError(response.status);
  }

  return body.data;
};

const getSummary = (): Promise<UsageSummaryData> =>
  request("/api/v1/usage/summary", isUsageSummaryData);

const getHistory = ({ page, limit }: UsageHistoryRequest): Promise<UsageHistoryData> => {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > maxHistoryPageNumber ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > maxHistoryPageSize
  ) {
    return Promise.reject(new UsageApiError(0));
  }

  return request(
    `/api/v1/usage/history?page=${encodeURIComponent(String(page))}&limit=${encodeURIComponent(String(limit))}`,
    isUsageHistoryData,
  );
};

const getQuota = (): Promise<UsageQuotaData> => request("/api/v1/usage/quota", isUsageQuotaData);

export const usageApi: UsageTransport = Object.freeze({
  getHistory,
  getQuota,
  getSummary,
  source: "api" as const,
});

export const createUsageApiTransport = (): UsageTransport => usageApi;
