import type {
  ReviewFinding,
  ReviewProcessResponse,
  ReviewResult,
  ReviewResultResponse,
  ReviewTransport,
  ReviewUsage,
} from "@/features/review/types";

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/+$/u, "") ?? "";

export class ReviewApiError extends Error {
  public readonly code: string | undefined;
  public readonly status: number;

  public constructor(status: number, code?: string) {
    super("The review transport could not complete the request.");
    this.name = "ReviewApiError";
    this.code = code;
    this.status = status;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => key in value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const isNonBlankString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isoDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

const isIsoDateTime = (value: unknown): value is string =>
  typeof value === "string" && isoDateTimePattern.test(value) && !Number.isNaN(Date.parse(value));

const isReviewFinding = (value: unknown): value is ReviewFinding => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    hasExactKeys(value, [
      "severity",
      "category",
      "title",
      "description",
      "suggestion",
      "filePath",
      "startLine",
      "endLine",
    ]) &&
    ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(value.severity as string) &&
    ["BUG", "SECURITY", "PERFORMANCE", "MAINTAINABILITY", "STYLE"].includes(
      value.category as string,
    ) &&
    isNonBlankString(value.title) &&
    isNonBlankString(value.description) &&
    isNonBlankString(value.suggestion) &&
    isNonBlankString(value.filePath) &&
    typeof value.startLine === "number" &&
    Number.isInteger(value.startLine) &&
    value.startLine > 0 &&
    typeof value.endLine === "number" &&
    Number.isInteger(value.endLine) &&
    value.endLine >= value.startLine
  );
};

const isReviewResult = (value: unknown): value is ReviewResult =>
  isRecord(value) &&
  hasExactKeys(value, ["schemaVersion", "summary", "findings"]) &&
  value.schemaVersion === "v1" &&
  isNonBlankString(value.summary) &&
  Array.isArray(value.findings) &&
  value.findings.every(isReviewFinding);

const isReviewProcessResponse = (value: unknown): value is ReviewProcessResponse => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.outcome !== "string") {
    return false;
  }

  if (value.outcome === "COMPLETED") {
    return (
      hasExactKeys(value, ["id", "outcome", "resultAvailable", "status"]) &&
      value.resultAvailable === true &&
      value.status === "COMPLETED"
    );
  }

  if (value.outcome === "SKIPPED" && value.reason === "ALREADY_COMPLETED") {
    return (
      hasExactKeys(value, ["id", "outcome", "reason", "resultAvailable", "status"]) &&
      value.resultAvailable === true &&
      value.status === "COMPLETED"
    );
  }

  return (
    value.outcome === "SKIPPED" &&
    value.reason === "ALREADY_PROCESSING" &&
    hasExactKeys(value, ["id", "outcome", "reason", "resultAvailable", "status"]) &&
    value.resultAvailable === false &&
    value.status === "PROCESSING"
  );
};

const isReviewUsage = (value: unknown): value is ReviewUsage => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["inputTokens", "outputTokens", "totalTokens", "cachedInputTokens"])
  ) {
    return false;
  }

  const hasCachedInputTokens = "cachedInputTokens" in value;

  return (
    isNonNegativeInteger(value.inputTokens) &&
    isNonNegativeInteger(value.outputTokens) &&
    isNonNegativeInteger(value.totalTokens) &&
    value.totalTokens === value.inputTokens + value.outputTokens &&
    (!hasCachedInputTokens ||
      (isNonNegativeInteger(value.cachedInputTokens) &&
        value.cachedInputTokens <= value.inputTokens))
  );
};

const isReviewResultResponse = (value: unknown): value is ReviewResultResponse => {
  if (!isRecord(value) || !hasExactKeys(value, ["execution", "id", "result", "status"])) {
    return false;
  }

  if (!isRecord(value.execution)) {
    return false;
  }

  return (
    hasExactKeys(value.execution, [
      "attempts",
      "completedAt",
      "durationMs",
      "model",
      "provider",
      "reasoningEffort",
      "usage",
    ]) &&
    typeof value.id === "string" &&
    value.status === "COMPLETED" &&
    isReviewResult(value.result) &&
    typeof value.execution.attempts === "number" &&
    Number.isInteger(value.execution.attempts) &&
    isIsoDateTime(value.execution.completedAt) &&
    typeof value.execution.durationMs === "number" &&
    Number.isInteger(value.execution.durationMs) &&
    value.execution.durationMs >= 0 &&
    value.execution.model === "gpt-5.6-luna" &&
    value.execution.provider === "luna" &&
    ["low", "medium", "max"].includes(value.execution.reasoningEffort as string) &&
    (value.execution.usage === null || isReviewUsage(value.execution.usage))
  );
};

const isSuccessEnvelope = (value: unknown): value is { readonly data: unknown } =>
  isRecord(value) &&
  "data" in value &&
  Object.keys(value).every((key) => key === "data" || key === "meta");

const readErrorCode = (value: unknown): string | undefined => {
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.code !== "string") {
    return undefined;
  }

  return value.error.code;
};

const request = async <TResponse>(
  path: string,
  init: RequestInit,
  isResponse: (value: unknown) => value is TResponse,
): Promise<TResponse> => {
  let response: Response;

  try {
    response = await fetch(`${apiOrigin}${path}`, init);
  } catch {
    throw new ReviewApiError(0);
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    throw new ReviewApiError(response.status, readErrorCode(body));
  }

  if (!isSuccessEnvelope(body) || !isResponse(body.data)) {
    throw new ReviewApiError(response.status);
  }

  return body.data;
};

const processReview = (reviewId: string): Promise<ReviewProcessResponse> =>
  request(
    `/api/v1/reviews/${encodeURIComponent(reviewId)}/process`,
    {
      body: "{}",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
    isReviewProcessResponse,
  );

const getReviewResult = (reviewId: string): Promise<ReviewResultResponse> =>
  request(
    `/api/v1/reviews/${encodeURIComponent(reviewId)}/result`,
    { credentials: "include", method: "GET" },
    isReviewResultResponse,
  );

export const reviewApi: ReviewTransport = Object.freeze({
  getResult: getReviewResult,
  process: processReview,
});

export const createReviewApiTransport = (): ReviewTransport => reviewApi;
