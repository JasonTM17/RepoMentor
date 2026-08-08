import type {
  ReviewFinding,
  ReviewAdmissionResponse,
  ReviewCancelResponse,
  ReviewLifecycleEvent,
  ReviewDraft,
  ReviewProcessResponse,
  ReviewResult,
  ReviewResultResponse,
  ReviewStreamOptions,
  ReviewStreamOutcome,
  ReviewTransport,
  ReviewUsage,
} from "@/features/review/types";

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/+$/u, "") ?? "";
const maxPageSize = 100;
const maxRequestIdLength = 128;
const maxReviewIdLength = 25;
const maxReviewEventIdLength = 10;
const maxReviewEventGeneration = 2_147_483_646;
const maxReviewEventBufferLength = 16_384;
const maxImprovedSourceLength = 100_000;
const maxReviewDiffLength = 64_000;
const maxGeneratedTests = 3;
const maxGeneratedTestLength = 8_000;
const maxLearningQuestions = 5;
const maxLearningQuestionLength = 500;

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

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => hasOwn(value, key));

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const isNonBlankString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isBoundedString = (value: unknown, maximum: number): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= maximum &&
  value === value.trim();

const isBoundedNonBlankString = (value: unknown, maximum: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= maximum && /\S/u.test(value);

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isoDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

const isIsoDateTime = (value: unknown): value is string =>
  typeof value === "string" && isoDateTimePattern.test(value) && !Number.isNaN(Date.parse(value));

interface ReviewApiMeta {
  readonly requestId?: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly total?: number;
}

const isApiMeta = (value: unknown): value is ReviewApiMeta => {
  if (!isRecord(value) || !hasOnlyKeys(value, ["requestId", "page", "pageSize", "total"])) {
    return false;
  }

  return (
    (!hasOwn(value, "requestId") || isBoundedString(value.requestId, maxRequestIdLength)) &&
    (!hasOwn(value, "page") ||
      (typeof value.page === "number" && Number.isInteger(value.page) && value.page > 0)) &&
    (!hasOwn(value, "pageSize") ||
      (typeof value.pageSize === "number" &&
        Number.isInteger(value.pageSize) &&
        value.pageSize > 0 &&
        value.pageSize <= maxPageSize)) &&
    (!hasOwn(value, "total") ||
      (typeof value.total === "number" && Number.isInteger(value.total) && value.total >= 0))
  );
};

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

const isReviewEducation = (value: unknown): value is ReviewResult["education"] => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["diff", "generatedTests", "improvedSource", "learningQuestions"])
  ) {
    return false;
  }

  return (
    (value.diff === null || isBoundedNonBlankString(value.diff, maxReviewDiffLength)) &&
    Array.isArray(value.generatedTests) &&
    value.generatedTests.length <= maxGeneratedTests &&
    value.generatedTests.every((test) => isBoundedNonBlankString(test, maxGeneratedTestLength)) &&
    (value.improvedSource === null ||
      isBoundedNonBlankString(value.improvedSource, maxImprovedSourceLength)) &&
    Array.isArray(value.learningQuestions) &&
    value.learningQuestions.length <= maxLearningQuestions &&
    value.learningQuestions.every((question) =>
      isBoundedString(question, maxLearningQuestionLength),
    )
  );
};

const isReviewResult = (value: unknown): value is ReviewResult =>
  isRecord(value) &&
  hasExactKeys(value, ["education", "schemaVersion", "summary", "findings"]) &&
  value.schemaVersion === "v1" &&
  isNonBlankString(value.summary) &&
  Array.isArray(value.findings) &&
  value.findings.every(isReviewFinding) &&
  isReviewEducation(value.education);

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

const reviewAdmissionStatuses = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

const isReviewAdmissionResponse = (value: unknown): value is ReviewAdmissionResponse => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    hasExactKeys(value, ["createdAt", "id", "language", "mode", "status", "updatedAt"]) &&
    isBoundedString(value.id, maxReviewIdLength) &&
    isBoundedString(value.language, 32) &&
    ["QUICK", "STANDARD", "DEEP"].includes(value.mode as string) &&
    reviewAdmissionStatuses.includes(value.status as (typeof reviewAdmissionStatuses)[number]) &&
    isIsoDateTime(value.createdAt) &&
    isIsoDateTime(value.updatedAt)
  );
};

const isReviewCancelResponse = (value: unknown): value is ReviewCancelResponse =>
  isReviewAdmissionResponse(value) && value.status === "CANCELLED";

const reviewLifecycleStatuses = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
const reviewLifecycleBaseKeys = [
  "generation",
  "id",
  "resultAvailable",
  "reviewId",
  "schemaVersion",
  "status",
  "type",
] as const;
const reviewEventIdPattern = /^[1-9][0-9]{0,9}$/u;

const isReviewLifecycleBase = (value: Record<string, unknown>): boolean =>
  isNonNegativeInteger(value.generation) &&
  value.generation <= maxReviewEventGeneration &&
  typeof value.id === "string" &&
  value.id.length <= maxReviewEventIdLength &&
  reviewEventIdPattern.test(value.id) &&
  typeof value.reviewId === "string" &&
  isBoundedString(value.reviewId, maxReviewIdLength) &&
  value.schemaVersion === "v1" &&
  reviewLifecycleStatuses.includes(value.status as (typeof reviewLifecycleStatuses)[number]) &&
  typeof value.resultAvailable === "boolean";

const isReviewLifecycleEvent = (value: unknown): value is ReviewLifecycleEvent => {
  if (!isRecord(value) || !isReviewLifecycleBase(value)) {
    return false;
  }

  if (value.type === "snapshot") {
    return (
      hasOnlyKeys(value, [...reviewLifecycleBaseKeys, "replay", "retryable"]) &&
      hasOwn(value, "replay") &&
      (value.replay === "current" || value.replay === "reset") &&
      (!hasOwn(value, "retryable") || typeof value.retryable === "boolean")
    );
  }

  if (value.type === "completed") {
    return (
      hasExactKeys(value, [...reviewLifecycleBaseKeys]) &&
      value.resultAvailable === true &&
      value.status === "COMPLETED"
    );
  }

  if (value.type === "failed") {
    return (
      hasExactKeys(value, [...reviewLifecycleBaseKeys, "retryable"]) &&
      value.resultAvailable === false &&
      value.retryable !== undefined &&
      typeof value.retryable === "boolean" &&
      value.status === "FAILED"
    );
  }

  if (value.type === "cancelled") {
    return (
      hasExactKeys(value, [...reviewLifecycleBaseKeys]) &&
      value.resultAvailable === false &&
      value.status === "CANCELLED"
    );
  }

  return (
    value.type === "heartbeat" &&
    hasExactKeys(value, [...reviewLifecycleBaseKeys]) &&
    value.status !== "COMPLETED" &&
    value.status !== "FAILED" &&
    value.status !== "CANCELLED"
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

const isSuccessEnvelope = (
  value: unknown,
): value is { readonly data: unknown; readonly meta?: ReviewApiMeta } =>
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

export interface ReviewApiTransportOptions {
  readonly apiOrigin?: string | undefined;
  readonly getAccessToken?: (() => string | undefined) | undefined;
}

const normalizeApiOrigin = (origin: string): string => origin.replace(/\/+$/u, "");

const withAuthHeaders = (
  headers: Record<string, string> | undefined,
  getAccessToken: (() => string | undefined) | undefined,
): Record<string, string> => {
  const token = getAccessToken?.();

  return token ? { ...headers, Authorization: `Bearer ${token}` } : { ...headers };
};

const request = async <TResponse>(
  origin: string,
  getAccessToken: (() => string | undefined) | undefined,
  path: string,
  init: RequestInit,
  isResponse: (value: unknown) => value is TResponse,
): Promise<TResponse> => {
  let response: Response;

  try {
    response = await fetch(`${origin}${path}`, {
      ...init,
      headers: withAuthHeaders(init.headers as Record<string, string> | undefined, getAccessToken),
    });
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

const isAbortError = (error: unknown): boolean => isRecord(error) && error.name === "AbortError";

const parseSseFrame = (frame: string): ReviewLifecycleEvent | undefined => {
  if (frame.trim() === "") {
    return undefined;
  }

  let eventType: string | undefined;
  let id: string | undefined;
  const dataLines: string[] = [];

  for (const line of frame.split(/\r?\n/u)) {
    if (line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      eventType = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("id:")) {
      id = line.slice(3).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      const data = line.slice(5);
      dataLines.push(data.startsWith(" ") ? data.slice(1) : data);
      continue;
    }

    if (line.trim() !== "") {
      throw new ReviewApiError(200, "INVALID_EVENT");
    }
  }

  const data = dataLines.join("\n");

  if (
    id === undefined ||
    eventType === undefined ||
    data.length === 0 ||
    data.length > maxReviewEventBufferLength
  ) {
    throw new ReviewApiError(200, "INVALID_EVENT");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new ReviewApiError(200, "INVALID_EVENT");
  }

  if (!isReviewLifecycleEvent(parsed) || parsed.id !== id || parsed.type !== eventType) {
    throw new ReviewApiError(200, "INVALID_EVENT");
  }

  return parsed;
};

const isTerminalEvent = (event: ReviewLifecycleEvent): boolean =>
  event.status === "COMPLETED" || event.status === "FAILED" || event.status === "CANCELLED";

const createIdempotencyKey = (): string => {
  const randomUuid = globalThis.crypto?.randomUUID?.();

  if (randomUuid) {
    return `web-review-${randomUuid}`;
  }

  return `web-review-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const consumeReviewEventStream = async (
  origin: string,
  getAccessToken: (() => string | undefined) | undefined,
  reviewId: string,
  options: ReviewStreamOptions = {},
): Promise<ReviewStreamOutcome> => {
  const headers = withAuthHeaders(
    {
      Accept: "text/event-stream",
      ...(options.lastEventId === undefined || options.lastEventId.trim() === ""
        ? {}
        : { "Last-Event-ID": options.lastEventId }),
    },
    getAccessToken,
  );
  let response: Response;

  try {
    response = await fetch(`${origin}/api/v1/reviews/${encodeURIComponent(reviewId)}/events`, {
      credentials: "include",
      headers,
      method: "GET",
      signal: options.signal ?? null,
    });
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) {
      return { kind: "disconnected" };
    }

    throw new ReviewApiError(0);
  }

  if (!response.ok) {
    throw new ReviewApiError(response.status);
  }

  if (!response.headers.get("content-type")?.toLowerCase().startsWith("text/event-stream")) {
    throw new ReviewApiError(response.status, "INVALID_EVENT_STREAM");
  }

  if (!response.body) {
    throw new ReviewApiError(response.status, "MISSING_EVENT_STREAM");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });

      if (buffer.length > maxReviewEventBufferLength) {
        throw new ReviewApiError(response.status, "EVENT_TOO_LARGE");
      }

      const frames = buffer.split(/\r?\n\r?\n/u);
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const event = parseSseFrame(frame);

        if (!event) {
          continue;
        }

        options.onEvent?.(event);

        if (isTerminalEvent(event)) {
          await reader.cancel().catch(() => undefined);
          return { event, kind: "terminal" };
        }
      }

      if (chunk.done) {
        buffer += decoder.decode();
        const event = parseSseFrame(buffer);

        if (event) {
          options.onEvent?.(event);
          if (isTerminalEvent(event)) {
            return { event, kind: "terminal" };
          }
        }

        return { kind: "disconnected" };
      }
    }
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) {
      return { kind: "disconnected" };
    }

    if (error instanceof ReviewApiError) {
      throw error;
    }

    throw new ReviewApiError(0);
  }
};

const createReviewTransport = (
  origin: string,
  getAccessToken: (() => string | undefined) | undefined,
): ReviewTransport => {
  const transport: ReviewTransport = {
    cancel: (reviewId) =>
      request(
        origin,
        getAccessToken,
        `/api/v1/reviews/${encodeURIComponent(reviewId)}/cancel`,
        { credentials: "include", method: "POST" },
        isReviewCancelResponse,
      ),
    create: (draft: ReviewDraft) =>
      request(
        origin,
        getAccessToken,
        "/api/v1/reviews",
        {
          body: JSON.stringify({
            language: draft.language,
            mode: draft.mode,
            source: draft.source,
          }),
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": createIdempotencyKey(),
          },
          method: "POST",
        },
        isReviewAdmissionResponse,
      ),
    getResult: (reviewId) =>
      request(
        origin,
        getAccessToken,
        `/api/v1/reviews/${encodeURIComponent(reviewId)}/result`,
        { credentials: "include", method: "GET" },
        isReviewResultResponse,
      ),
    process: (reviewId) =>
      request(
        origin,
        getAccessToken,
        `/api/v1/reviews/${encodeURIComponent(reviewId)}/process`,
        {
          body: "{}",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
        isReviewProcessResponse,
      ),
  };

  return Object.freeze({
    ...transport,
    ...(origin !== "" && getAccessToken !== undefined
      ? {
          stream: (reviewId: string, options?: ReviewStreamOptions) =>
            consumeReviewEventStream(origin, getAccessToken, reviewId, options),
        }
      : {}),
  });
};

export const reviewApi: ReviewTransport = createReviewTransport(apiOrigin, undefined);

export const createReviewApiTransport = (
  options: ReviewApiTransportOptions = {},
): ReviewTransport =>
  createReviewTransport(normalizeApiOrigin(options.apiOrigin ?? apiOrigin), options.getAccessToken);
