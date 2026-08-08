import type {
  ReviewHistoryData,
  ReviewHistoryDeleteData,
  ReviewHistoryItem,
  ReviewHistoryMode,
  ReviewHistoryRequest,
  ReviewHistorySort,
  ReviewHistoryStatus,
  ReviewHistoryTransport,
} from "@/features/history/types";

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/+$/u, "") ?? "";
const maxPageSize = 50;
const maxPageNumber = 10_000;
const maxIdLength = 25;
const maxLanguageLength = 32;
const maxTitleLength = 80;
const maxContextLength = 500;
const maxRequestIdLength = 128;
const maxEnvelopePageSize = 100;
const modes: readonly ReviewHistoryMode[] = ["QUICK", "STANDARD", "DEEP"];
const statuses: readonly ReviewHistoryStatus[] = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];
const sorts: readonly ReviewHistorySort[] = ["asc", "desc"];
const levels = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;

export class ReviewHistoryApiError extends Error {
  public readonly status: number;

  public constructor(status: number) {
    super("Review history request failed.");
    this.name = "ReviewHistoryApiError";
    this.status = status;
  }
}

export interface ReviewHistoryApiOptions {
  readonly apiOrigin?: string;
  readonly getAccessToken?: () => string | undefined;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => hasOwn(value, key));

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const isBoundedString = (value: unknown, maximum: number): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= maximum &&
  value === value.trim();

const isTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
  !Number.isNaN(Date.parse(value));

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const isMode = (value: unknown): value is ReviewHistoryMode =>
  typeof value === "string" && modes.includes(value as ReviewHistoryMode);

const isStatus = (value: unknown): value is ReviewHistoryStatus =>
  typeof value === "string" && statuses.includes(value as ReviewHistoryStatus);

const isItem = (value: unknown): value is ReviewHistoryItem => {
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, [
      "id",
      "language",
      "mode",
      "learnerLevel",
      "status",
      "createdAt",
      "updatedAt",
    ]) &&
      !hasExactKeys(value, [
        "id",
        "language",
        "mode",
        "learnerLevel",
        "title",
        "status",
        "createdAt",
        "updatedAt",
      ]) &&
      !hasExactKeys(value, [
        "id",
        "language",
        "mode",
        "learnerLevel",
        "title",
        "context",
        "status",
        "createdAt",
        "updatedAt",
      ]))
  ) {
    return false;
  }

  return (
    isBoundedString(value.id, maxIdLength) &&
    isBoundedString(value.language, maxLanguageLength) &&
    isMode(value.mode) &&
    levels.includes(value.learnerLevel as (typeof levels)[number]) &&
    isStatus(value.status) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt) &&
    (!hasOwn(value, "title") || isBoundedString(value.title, maxTitleLength)) &&
    (!hasOwn(value, "context") || isBoundedString(value.context, maxContextLength))
  );
};

const isMeta = (value: unknown): value is ReviewHistoryData["meta"] =>
  isRecord(value) &&
  hasExactKeys(value, ["page", "limit", "total", "totalPages", "hasNext", "hasPrevious"]) &&
  typeof value.page === "number" &&
  Number.isSafeInteger(value.page) &&
  value.page > 0 &&
  value.page <= maxPageNumber &&
  typeof value.limit === "number" &&
  Number.isSafeInteger(value.limit) &&
  value.limit > 0 &&
  value.limit <= maxPageSize &&
  isNonNegativeInteger(value.total) &&
  isNonNegativeInteger(value.totalPages) &&
  value.totalPages <= maxPageNumber &&
  typeof value.hasNext === "boolean" &&
  typeof value.hasPrevious === "boolean";

const isData = (value: unknown): value is ReviewHistoryData =>
  isRecord(value) &&
  hasExactKeys(value, ["items", "meta"]) &&
  Array.isArray(value.items) &&
  value.items.every(isItem) &&
  isMeta(value.meta);

const isDeleteData = (value: unknown): value is ReviewHistoryDeleteData =>
  isRecord(value) &&
  hasExactKeys(value, ["deletedCount"]) &&
  isNonNegativeInteger(value.deletedCount);

const isApiMeta = (value: unknown): boolean =>
  isRecord(value) &&
  hasOnlyKeys(value, ["requestId", "page", "pageSize", "total"]) &&
  (!hasOwn(value, "requestId") || isBoundedString(value.requestId, maxRequestIdLength)) &&
  (!hasOwn(value, "page") || isPositiveInteger(value.page)) &&
  (!hasOwn(value, "pageSize") ||
    (isPositiveInteger(value.pageSize) && value.pageSize <= maxEnvelopePageSize)) &&
  (!hasOwn(value, "total") || isNonNegativeInteger(value.total));

const isSuccessEnvelope = (value: unknown): value is { readonly data: unknown } =>
  isRecord(value) &&
  hasOwn(value, "data") &&
  hasOnlyKeys(value, ["data", "meta"]) &&
  (!hasOwn(value, "meta") || isApiMeta(value.meta));

const normalizeOrigin = (origin: string): string => origin.replace(/\/+$/u, "");

const request = async <T>(
  origin: string,
  getAccessToken: (() => string | undefined) | undefined,
  path: string,
  init: RequestInit,
  parse: (value: unknown) => value is T,
): Promise<T> => {
  let response: Response;
  const accessToken = getAccessToken?.();

  try {
    const requestHeaders = {
      ...(init.headers ?? {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    };

    response = await fetch(`${origin}${path}`, {
      ...init,
      credentials: "include",
      ...(Object.keys(requestHeaders).length > 0 ? { headers: requestHeaders } : {}),
    });
  } catch {
    throw new ReviewHistoryApiError(0);
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok || !isSuccessEnvelope(body) || !parse(body.data)) {
    throw new ReviewHistoryApiError(response.status);
  }

  return body.data;
};

const assertRequest = (request: ReviewHistoryRequest): void => {
  if (
    !Number.isSafeInteger(request.page) ||
    request.page < 1 ||
    request.page > maxPageNumber ||
    !Number.isSafeInteger(request.limit) ||
    request.limit < 1 ||
    request.limit > maxPageSize ||
    (request.title !== undefined &&
      (!isBoundedString(request.title, maxTitleLength) || request.title.length < 1)) ||
    (request.language !== undefined &&
      (!isBoundedString(request.language, maxLanguageLength) || request.language.length < 1)) ||
    (request.mode !== undefined && !isMode(request.mode)) ||
    (request.status !== undefined && !isStatus(request.status)) ||
    !sorts.includes(request.sort)
  ) {
    throw new ReviewHistoryApiError(0);
  }
};

const createListQuery = (request: ReviewHistoryRequest): string => {
  assertRequest(request);
  const params = new URLSearchParams({
    limit: String(request.limit),
    page: String(request.page),
    sort: request.sort,
  });

  if (request.title !== undefined) params.set("title", request.title);
  if (request.language !== undefined) params.set("language", request.language);
  if (request.mode !== undefined) params.set("mode", request.mode);
  if (request.status !== undefined) params.set("status", request.status);

  return params.toString();
};

const createDeleteBody = (ids: readonly string[]): string => {
  const uniqueIds = [...new Set(ids)];

  if (
    uniqueIds.length < 1 ||
    uniqueIds.length > 100 ||
    uniqueIds.some((id) => !isBoundedString(id, maxIdLength))
  ) {
    throw new ReviewHistoryApiError(0);
  }

  return JSON.stringify({ ids: uniqueIds });
};

export const createReviewHistoryApiTransport = (
  options: ReviewHistoryApiOptions = {},
): ReviewHistoryTransport => {
  const origin = normalizeOrigin(options.apiOrigin ?? apiOrigin);

  return Object.freeze({
    deleteMany: (ids: readonly string[]) =>
      request(
        origin,
        options.getAccessToken,
        "/api/v1/reviews",
        {
          body: createDeleteBody(ids),
          headers: { "Content-Type": "application/json" },
          method: "DELETE",
        },
        isDeleteData,
      ),
    list: (historyRequest: ReviewHistoryRequest) =>
      request(
        origin,
        options.getAccessToken,
        `/api/v1/reviews?${createListQuery(historyRequest)}`,
        { method: "GET" },
        isData,
      ),
  });
};
