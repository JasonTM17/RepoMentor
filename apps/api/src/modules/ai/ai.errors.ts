import { AI_PROVIDER } from "./ai.types.js";

export const AI_PROVIDER_ERROR_CODES = [
  "AUTHENTICATION",
  "BAD_REQUEST",
  "CANCELLED",
  "CONFIGURATION",
  "INCOMPLETE_RESPONSE",
  "INVALID_REQUEST",
  "MALFORMED_RESPONSE",
  "PROVIDER_REFUSAL",
  "RATE_LIMITED",
  "TIMEOUT",
  "UNAVAILABLE",
] as const;
export type AiProviderErrorCode = (typeof AI_PROVIDER_ERROR_CODES)[number];

const PROVIDER_ERROR_MESSAGES: Readonly<Record<AiProviderErrorCode, string>> = {
  AUTHENTICATION: "The Luna provider rejected authentication.",
  BAD_REQUEST: "The Luna provider rejected the request.",
  CANCELLED: "The Luna provider request was cancelled.",
  CONFIGURATION: "The Luna provider is not configured.",
  INCOMPLETE_RESPONSE: "The Luna provider returned an incomplete response.",
  INVALID_REQUEST: "The AI review request is invalid for the Luna provider.",
  MALFORMED_RESPONSE: "The Luna provider returned a malformed response.",
  PROVIDER_REFUSAL: "The Luna provider refused the review request.",
  RATE_LIMITED: "The Luna provider rate limited the request.",
  TIMEOUT: "The Luna provider timed out.",
  UNAVAILABLE: "The Luna provider is unavailable.",
};

export interface AiProviderErrorOptions {
  readonly retryable?: boolean;
  readonly statusCode?: number;
  readonly attempts?: number;
}

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  readonly provider = AI_PROVIDER;
  readonly retryable: boolean;
  readonly statusCode?: number;
  readonly attempts?: number;

  constructor(code: AiProviderErrorCode, options: AiProviderErrorOptions = {}) {
    super(PROVIDER_ERROR_MESSAGES[code]);
    this.name = "AiProviderError";
    this.code = code;
    this.retryable = options.retryable ?? false;

    if (options.statusCode !== undefined) {
      this.statusCode = options.statusCode;
    }

    if (options.attempts !== undefined) {
      this.attempts = options.attempts;
    }
  }

  withAttempts(attempts: number): AiProviderError {
    const options: AiProviderErrorOptions = {
      attempts,
      retryable: this.retryable,
      ...(this.statusCode === undefined ? {} : { statusCode: this.statusCode }),
    };

    return new AiProviderError(this.code, options);
  }
}

export class AiRequestError extends Error {
  readonly code = "INVALID_REQUEST" as const;

  constructor() {
    super("The AI review request is invalid.");
    this.name = "AiRequestError";
  }
}

export interface AiValidationErrorOptions {
  readonly attempts?: number;
}

export class AiValidationError extends Error {
  readonly code = "INVALID_RESULT" as const;
  readonly attempts?: number;

  constructor(options: AiValidationErrorOptions = {}) {
    super("The AI provider result failed local validation.");
    this.name = "AiValidationError";

    if (options.attempts !== undefined) {
      this.attempts = options.attempts;
    }
  }
}

export type AiReviewError = AiProviderError | AiRequestError | AiValidationError;

export function asAiProviderError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) {
    return error;
  }

  return new AiProviderError("UNAVAILABLE");
}
