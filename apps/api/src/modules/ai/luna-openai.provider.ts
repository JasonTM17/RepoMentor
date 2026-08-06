import { AiProviderError, asAiProviderError } from "./ai.errors.js";
import {
  AI_MAX_DEVELOPER_PROMPT_LENGTH,
  AI_MAX_OUTPUT_TOKENS,
  AI_MAX_PROVIDER_RETRIES,
  AI_MAX_RESPONSE_BYTES,
  AI_MAX_RESULT_RETRIES,
  AI_MAX_SYSTEM_PROMPT_LENGTH,
  AI_MAX_TIMEOUT_MS,
  AI_MAX_USER_PROMPT_LENGTH,
  AI_RETRY_BACKOFF_MS,
  AI_TIMEOUT_MS,
} from "./ai.policy.js";
import { REVIEW_RESULT_SCHEMA_NAME, reviewResultJsonSchema } from "./review-result.schema.js";
import {
  AI_MODEL,
  AI_PROMPT_VERSION,
  AI_PROVIDER,
  AI_REASONING_EFFORTS,
  type AiProviderRequest,
  type AiProviderResult,
  type AiReviewProvider,
  type AiUsage,
} from "./ai.types.js";

export const DEFAULT_LUNA_API_BASE_URL = "https://api.openai.com/v1";

export interface LunaOpenAiProviderOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly fetch?: typeof globalThis.fetch;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

type JsonRecord = Record<string, unknown>;

export class LunaOpenAiProvider implements AiReviewProvider {
  private readonly apiKey: string | undefined;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: LunaOpenAiProviderOptions = {}) {
    const configuredApiKey =
      options.apiKey !== undefined ? options.apiKey : process.env.LUNA_API_KEY;
    const configuredBaseUrl =
      options.baseUrl !== undefined
        ? options.baseUrl
        : (process.env.LUNA_API_BASE_URL ?? DEFAULT_LUNA_API_BASE_URL);
    const timeoutMs = options.timeoutMs ?? AI_TIMEOUT_MS;
    const maxRetries = options.maxRetries ?? AI_MAX_PROVIDER_RETRIES;

    this.apiKey = normalizeSecret(configuredApiKey);
    this.endpoint = buildResponsesEndpoint(configuredBaseUrl);
    this.timeoutMs = validateTimeout(timeoutMs);
    this.maxRetries = validateRetries(maxRetries);
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep ?? sleep;
  }

  async review(request: AiProviderRequest): Promise<AiProviderResult> {
    assertProviderRequest(request);

    if (!this.apiKey) {
      throw new AiProviderError("CONFIGURATION");
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.requestOnce(request, this.apiKey);
      } catch (error: unknown) {
        const providerError = asAiProviderError(error);

        if (!providerError.retryable || attempt === this.maxRetries) {
          throw providerError.withAttempts(attempt + 1);
        }

        await sleepWithCancellation(
          this.sleep,
          AI_RETRY_BACKOFF_MS[attempt] ?? AI_RETRY_BACKOFF_MS.at(-1)!,
          request.signal,
        );
      }
    }

    throw new AiProviderError("UNAVAILABLE", { attempts: this.maxRetries + 1 });
  }

  private async requestOnce(request: AiProviderRequest, apiKey: string): Promise<AiProviderResult> {
    if (request.signal?.aborted) {
      throw new AiProviderError("CANCELLED");
    }

    const controller = new AbortController();
    let timedOut = false;
    const onCallerAbort = () => controller.abort();
    request.signal?.addEventListener("abort", onCallerAbort, { once: true });
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const payload = buildRequestPayload(request);

    try {
      const response = await this.fetcher(this.endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw errorForHttpStatus(response.status);
      }

      const body = await readBoundedResponseBody(response);
      const providerResponse = parseJsonBody(body);
      const output = extractStructuredOutput(providerResponse);
      const usage = parseUsage(providerResponse);

      if (usage !== undefined) {
        return { output, usage };
      }

      return { output };
    } catch (error: unknown) {
      if (timedOut) {
        throw new AiProviderError("TIMEOUT", { retryable: true });
      }

      if (request.signal?.aborted) {
        throw new AiProviderError("CANCELLED");
      }

      if (error instanceof AiProviderError) {
        throw error;
      }

      throw new AiProviderError("UNAVAILABLE", { retryable: true });
    } finally {
      clearTimeout(timeoutHandle);
      request.signal?.removeEventListener("abort", onCallerAbort);
    }
  }
}

function normalizeSecret(secret: string | undefined): string | undefined {
  const normalized = secret?.trim();
  return normalized ? normalized : undefined;
}

function buildResponsesEndpoint(baseUrl: string): string {
  let url: URL;

  try {
    url = new URL(baseUrl);
  } catch {
    throw new AiProviderError("CONFIGURATION");
  }

  const pathname = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;

  if (
    url.origin !== "https://api.openai.com" ||
    pathname !== "/v1" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new AiProviderError("CONFIGURATION");
  }

  return `${DEFAULT_LUNA_API_BASE_URL}/responses`;
}

function validateTimeout(timeoutMs: number): number {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > AI_MAX_TIMEOUT_MS) {
    throw new AiProviderError("CONFIGURATION");
  }

  return timeoutMs;
}

function validateRetries(maxRetries: number): number {
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > AI_MAX_PROVIDER_RETRIES) {
    throw new AiProviderError("CONFIGURATION");
  }

  return maxRetries;
}

function assertProviderRequest(request: AiProviderRequest): void {
  if (
    request.provider !== AI_PROVIDER ||
    request.model !== AI_MODEL ||
    !AI_REASONING_EFFORTS.includes(request.reasoningEffort) ||
    !Number.isInteger(request.attempt) ||
    request.attempt < 0 ||
    request.attempt > AI_MAX_RESULT_RETRIES ||
    request.prompt.version !== AI_PROMPT_VERSION ||
    request.prompt.system.length > AI_MAX_SYSTEM_PROMPT_LENGTH ||
    request.prompt.developer.length > AI_MAX_DEVELOPER_PROMPT_LENGTH ||
    request.prompt.user.length > AI_MAX_USER_PROMPT_LENGTH
  ) {
    throw new AiProviderError("INVALID_REQUEST");
  }
}

function buildRequestPayload(request: AiProviderRequest): JsonRecord {
  return {
    model: AI_MODEL,
    input: [
      { role: "system", content: request.prompt.system },
      { role: "developer", content: request.prompt.developer },
      { role: "user", content: request.prompt.user },
    ],
    reasoning: { effort: request.reasoningEffort },
    max_output_tokens: AI_MAX_OUTPUT_TOKENS,
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: REVIEW_RESULT_SCHEMA_NAME,
        strict: true,
        schema: reviewResultJsonSchema,
      },
    },
  };
}

function errorForHttpStatus(statusCode: number): AiProviderError {
  if (statusCode === 401 || statusCode === 403) {
    return new AiProviderError("AUTHENTICATION", { statusCode });
  }

  if (statusCode === 408) {
    return new AiProviderError("TIMEOUT", { retryable: true, statusCode });
  }

  if (statusCode === 429) {
    return new AiProviderError("RATE_LIMITED", { retryable: true, statusCode });
  }

  if (statusCode === 409 || statusCode === 425 || statusCode >= 500) {
    return new AiProviderError("UNAVAILABLE", { retryable: true, statusCode });
  }

  return new AiProviderError("BAD_REQUEST", { statusCode });
}

async function readBoundedResponseBody(response: Response): Promise<string> {
  if (!response.body) {
    try {
      const body = await response.text();

      if (new TextEncoder().encode(body).byteLength > AI_MAX_RESPONSE_BYTES) {
        throw new AiProviderError("MALFORMED_RESPONSE");
      }

      return body;
    } catch (error: unknown) {
      if (error instanceof AiProviderError) {
        throw error;
      }

      throw new AiProviderError("MALFORMED_RESPONSE");
    }
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > AI_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new AiProviderError("MALFORMED_RESPONSE");
      }

      chunks.push(decoder.decode(value, { stream: true }));
    }

    chunks.push(decoder.decode());
    return chunks.join("");
  } catch (error: unknown) {
    if (error instanceof AiProviderError) {
      throw error;
    }

    throw new AiProviderError("MALFORMED_RESPONSE");
  }
}

function parseJsonBody(body: string): JsonRecord {
  try {
    const parsed: unknown = JSON.parse(body);

    if (!isRecord(parsed)) {
      throw new Error();
    }

    return parsed;
  } catch {
    throw new AiProviderError("MALFORMED_RESPONSE", { retryable: true });
  }
}

function extractStructuredOutput(response: JsonRecord): unknown {
  if (response.status === "incomplete") {
    throw new AiProviderError("INCOMPLETE_RESPONSE", { retryable: true });
  }

  if (typeof response.output_text === "string") {
    return parseOutputText(response.output_text);
  }

  if (!Array.isArray(response.output)) {
    throw new AiProviderError("MALFORMED_RESPONSE", { retryable: true });
  }

  for (const item of response.output) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (!isRecord(content)) {
        continue;
      }

      if (content.type === "refusal") {
        throw new AiProviderError("PROVIDER_REFUSAL");
      }

      if (content.type === "output_text" && typeof content.text === "string") {
        return parseOutputText(content.text);
      }
    }
  }

  throw new AiProviderError("MALFORMED_RESPONSE", { retryable: true });
}

function parseOutputText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AiProviderError("MALFORMED_RESPONSE", { retryable: true });
  }
}

function parseUsage(response: JsonRecord): AiUsage | undefined {
  if (!isRecord(response.usage)) {
    return undefined;
  }

  const inputTokens = readTokenCount(response.usage.input_tokens);
  const outputTokens = readTokenCount(response.usage.output_tokens);

  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }

  const totalTokens = readTokenCount(response.usage.total_tokens) ?? inputTokens + outputTokens;
  const inputDetails = isRecord(response.usage.input_tokens_details)
    ? response.usage.input_tokens_details
    : undefined;
  const cachedInputTokens = inputDetails ? readTokenCount(inputDetails.cached_tokens) : undefined;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
  };
}

function readTokenCount(value: unknown): number | undefined {
  if (!Number.isInteger(value) || typeof value !== "number" || value < 0 || value > 100_000_000) {
    return undefined;
  }

  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function sleepWithCancellation(
  sleepFunction: (milliseconds: number) => Promise<void>,
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal === undefined) {
    await sleepFunction(milliseconds);
    return;
  }

  if (signal.aborted) {
    throw new AiProviderError("CANCELLED");
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
    };
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => {
      finish(() => reject(new AiProviderError("CANCELLED")));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    void sleepFunction(milliseconds).then(
      () => finish(resolve),
      () => finish(() => reject(new AiProviderError("UNAVAILABLE", { retryable: true }))),
    );
  });
}
