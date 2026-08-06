import type { ReviewStatus, ReviewStatusTransition } from "../review.types.js";

export type ReviewProcessingTransitionName = "claim" | "complete" | "fail" | "cancel";

export interface ReviewProcessingTransitionRule {
  readonly fromStatuses: readonly ReviewStatus[];
  readonly toStatus: ReviewStatus;
}

export const REVIEW_PROCESSING_TRANSITIONS = {
  cancel: { fromStatuses: ["PROCESSING"], toStatus: "CANCELLED" },
  claim: { fromStatuses: ["PENDING"], toStatus: "PROCESSING" },
  complete: { fromStatuses: ["PROCESSING"], toStatus: "COMPLETED" },
  fail: { fromStatuses: ["PROCESSING"], toStatus: "FAILED" },
} as const satisfies Readonly<
  Record<ReviewProcessingTransitionName, ReviewProcessingTransitionRule>
>;

export function createProcessingTransition(
  name: ReviewProcessingTransitionName,
  now: Date,
  expectedProcessingGeneration?: number,
): ReviewStatusTransition {
  const rule = REVIEW_PROCESSING_TRANSITIONS[name];

  return {
    fromStatuses: rule.fromStatuses,
    now: new Date(now),
    toStatus: rule.toStatus,
    ...(expectedProcessingGeneration === undefined ? {} : { expectedProcessingGeneration }),
  };
}
