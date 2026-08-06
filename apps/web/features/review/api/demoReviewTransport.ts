import { createDeterministicFixtureResult } from "@/features/review/helpers/reviewHelpers";
import type { ReviewDraft, ReviewTransport } from "@/features/review/types";

export const DEMO_REVIEW_ID = "demo-phase-08-review";

const wait = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });

export const createDemoReviewTransport = (draft: ReviewDraft): ReviewTransport => {
  const result = createDeterministicFixtureResult(draft);

  return Object.freeze({
    process: async (reviewId: string) => {
      await wait(220);

      return {
        id: reviewId,
        outcome: "COMPLETED" as const,
        resultAvailable: true as const,
        status: "COMPLETED" as const,
      };
    },
    getResult: async (reviewId: string) => {
      await wait(180);

      return {
        execution: {
          attempts: 1,
          completedAt: "2026-08-06T00:00:00.000Z",
          durationMs: 0,
          model: "gpt-5.6-luna" as const,
          provider: "luna" as const,
          reasoningEffort: "max" as const,
          usage: null,
        },
        id: reviewId,
        result,
        status: "COMPLETED" as const,
      };
    },
  });
};
