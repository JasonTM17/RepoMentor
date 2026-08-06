import type { ReviewResultResponse, ReviewTransport } from "@/features/review/types";

export const REVIEW_RESULT_MAX_CHECKS = 4;
export const REVIEW_RESULT_CHECK_DELAY_MS = 250;

export type ReviewResultPollingOutcome =
  | { readonly kind: "ready"; readonly response: ReviewResultResponse }
  | { readonly kind: "processing" }
  | { readonly kind: "cancelled" };

export interface ReviewResultPollingOptions {
  readonly isCurrent: () => boolean;
  readonly delayMs?: number;
  readonly maxChecks?: number;
  readonly sleep?: (durationMs: number) => Promise<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const defaultSleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });

export const isExpectedResultNotReadyError = (error: unknown): boolean => {
  if (!isRecord(error)) {
    return false;
  }

  return error.status === 409 && (error.code === "CONFLICT" || error.code === "RESULT_NOT_READY");
};

export const getReviewResultWithPolling = async (
  transport: Pick<ReviewTransport, "getResult">,
  reviewId: string,
  options: ReviewResultPollingOptions,
): Promise<ReviewResultPollingOutcome> => {
  const maxChecks = Math.max(1, Math.floor(options.maxChecks ?? REVIEW_RESULT_MAX_CHECKS));
  const delayMs = Math.max(0, options.delayMs ?? REVIEW_RESULT_CHECK_DELAY_MS);
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; attempt < maxChecks; attempt += 1) {
    if (!options.isCurrent()) {
      return { kind: "cancelled" };
    }

    try {
      const response = await transport.getResult(reviewId);

      return options.isCurrent() ? { kind: "ready", response } : { kind: "cancelled" };
    } catch (error) {
      if (!options.isCurrent()) {
        return { kind: "cancelled" };
      }

      if (!isExpectedResultNotReadyError(error)) {
        throw error;
      }

      if (attempt === maxChecks - 1) {
        return { kind: "processing" };
      }

      await sleep(delayMs);

      if (!options.isCurrent()) {
        return { kind: "cancelled" };
      }
    }
  }

  return { kind: "processing" };
};
