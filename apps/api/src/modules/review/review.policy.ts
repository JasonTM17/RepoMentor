import type { ReviewStatus } from "./review.types.js";

const ALLOWED_TRANSITIONS: Readonly<Record<ReviewStatus, readonly ReviewStatus[]>> = {
  CANCELLED: ["PENDING"],
  COMPLETED: [],
  FAILED: ["PENDING"],
  PENDING: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["COMPLETED", "FAILED", "CANCELLED"],
};

export function canTransition(fromStatus: ReviewStatus, toStatus: ReviewStatus): boolean {
  return ALLOWED_TRANSITIONS[fromStatus].includes(toStatus);
}

export function allowedSourceStatuses(toStatus: ReviewStatus): readonly ReviewStatus[] {
  return Object.entries(ALLOWED_TRANSITIONS)
    .filter(([, targets]) => targets.includes(toStatus))
    .map(([status]) => status as ReviewStatus);
}

export function reviewTransitions(): Readonly<Record<ReviewStatus, readonly ReviewStatus[]>> {
  return ALLOWED_TRANSITIONS;
}
