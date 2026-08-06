import {
  AiProviderError,
  AiRequestError,
  AiValidationError,
  type AiProviderErrorCode,
} from "../../ai/ai.errors.js";

type NonCancellationAiProviderErrorCode = Exclude<AiProviderErrorCode, "CANCELLED">;

export type ReviewProcessingFailureCode =
  | "AI_REQUEST_INVALID"
  | "AI_RESULT_INVALID"
  | `AI_PROVIDER_${NonCancellationAiProviderErrorCode}`
  | "INTERNAL";

export interface ReviewProcessingFailure {
  readonly kind: "FAILURE";
  readonly code: ReviewProcessingFailureCode;
  readonly retryable: boolean;
  readonly providerCode?: NonCancellationAiProviderErrorCode;
  readonly attempts?: number;
}

export type ReviewProcessingCancellationSource = "SIGNAL" | "AI_PROVIDER" | "CONCURRENT_TRANSITION";

export interface ReviewProcessingCancellation {
  readonly kind: "CANCELLATION";
  readonly code: "CANCELLED";
  readonly source: ReviewProcessingCancellationSource;
  readonly providerCode?: "CANCELLED";
}

export type ReviewProcessingErrorMapping =
  | { readonly kind: "FAILED"; readonly failure: ReviewProcessingFailure }
  | { readonly kind: "CANCELLED"; readonly cancellation: ReviewProcessingCancellation };

export const REVIEW_PROCESSING_BOUNDARY_ERROR_CODES = [
  "REVIEW_NOT_FOUND",
  "CLAIM_CONFLICT",
  "FINALIZATION_CONFLICT",
  "RESULT_NOT_READY",
  "RESULT_UNAVAILABLE",
] as const;
export type ReviewProcessingBoundaryErrorCode =
  (typeof REVIEW_PROCESSING_BOUNDARY_ERROR_CODES)[number];

const BOUNDARY_ERROR_MESSAGES: Readonly<Record<ReviewProcessingBoundaryErrorCode, string>> = {
  CLAIM_CONFLICT: "The review could not be claimed for processing.",
  FINALIZATION_CONFLICT: "The review processing result could not be committed.",
  REVIEW_NOT_FOUND: "The review was not found.",
  RESULT_NOT_READY: "The review result is not available yet.",
  RESULT_UNAVAILABLE: "The completed review result is unavailable.",
};

export class ReviewProcessingBoundaryError extends Error {
  readonly code: ReviewProcessingBoundaryErrorCode;

  constructor(code: ReviewProcessingBoundaryErrorCode) {
    super(BOUNDARY_ERROR_MESSAGES[code]);
    this.name = "ReviewProcessingBoundaryError";
    this.code = code;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function mapProviderFailure(error: AiProviderError): ReviewProcessingFailure {
  if (error.code === "CANCELLED") {
    throw new Error("Cancellation must be mapped before provider failures.");
  }

  return {
    ...(error.attempts === undefined ? {} : { attempts: error.attempts }),
    code: `AI_PROVIDER_${error.code}`,
    kind: "FAILURE",
    providerCode: error.code,
    retryable: error.retryable,
  };
}

export function mapAiError(error: unknown, signal?: AbortSignal): ReviewProcessingErrorMapping {
  if (signal?.aborted || isAbortError(error)) {
    return {
      cancellation: {
        code: "CANCELLED",
        kind: "CANCELLATION",
        source: "SIGNAL",
      },
      kind: "CANCELLED",
    };
  }

  if (error instanceof AiProviderError) {
    if (error.code === "CANCELLED") {
      return {
        cancellation: {
          code: "CANCELLED",
          kind: "CANCELLATION",
          providerCode: "CANCELLED",
          source: "AI_PROVIDER",
        },
        kind: "CANCELLED",
      };
    }

    return { failure: mapProviderFailure(error), kind: "FAILED" };
  }

  if (error instanceof AiRequestError) {
    return {
      failure: {
        code: "AI_REQUEST_INVALID",
        kind: "FAILURE",
        retryable: false,
      },
      kind: "FAILED",
    };
  }

  if (error instanceof AiValidationError) {
    return {
      failure: {
        ...(error.attempts === undefined ? {} : { attempts: error.attempts }),
        code: "AI_RESULT_INVALID",
        kind: "FAILURE",
        retryable: false,
      },
      kind: "FAILED",
    };
  }

  return {
    failure: {
      code: "INTERNAL",
      kind: "FAILURE",
      retryable: false,
    },
    kind: "FAILED",
  };
}
