import type { AiReviewExecution } from "../../ai/ai.types.js";
import type { ReviewResult } from "../../ai/review-result.schema.js";
import type {
  ReviewProcessingCancellation,
  ReviewProcessingFailure,
} from "./review-processing.errors.js";
import type { ReviewResultRecord } from "../review-result.persistence.js";
import type { ReviewRecord, ReviewStatus, ReviewStatusTransition } from "../review.types.js";

export interface ReviewProcessingRequest {
  readonly userId: string;
  readonly reviewId: string;
  readonly signal?: AbortSignal;
}

export interface ReviewProcessingRepository {
  findByIdForUser(userId: string, id: string): Promise<ReviewRecord | null>;
  transitionForUser(
    userId: string,
    id: string,
    transition: ReviewStatusTransition,
  ): Promise<ReviewRecord | null>;
  finalizeForUser(
    userId: string,
    id: string,
    execution: AiReviewExecution<ReviewResult>,
    now: Date,
  ): Promise<ReviewRecord | null>;
  findResultForUser(userId: string, id: string): Promise<ReviewResultRecord | null>;
}

export type ReviewProcessingClaim =
  | { readonly kind: "CLAIMED"; readonly review: ReviewRecord }
  | { readonly kind: "ALREADY_PROCESSING"; readonly review: ReviewRecord }
  | { readonly kind: "ALREADY_COMPLETED"; readonly review: ReviewRecord }
  | {
      readonly kind: "NOT_CLAIMED";
      readonly reason: "RETRY_REQUIRED";
      readonly review: ReviewRecord;
      readonly status: "FAILED" | "CANCELLED";
    };

export type ReviewProcessingSkippedReason =
  "ALREADY_PROCESSING" | "ALREADY_COMPLETED" | "RETRY_REQUIRED";

export type ReviewProcessingOutcome =
  | {
      readonly kind: "COMPLETED";
      readonly status: "COMPLETED";
      readonly review: ReviewRecord;
      readonly execution: AiReviewExecution<ReviewResult>;
    }
  | {
      readonly kind: "FAILED";
      readonly status: "FAILED";
      readonly review: ReviewRecord;
      readonly failure: ReviewProcessingFailure;
    }
  | {
      readonly kind: "CANCELLED";
      readonly status: "CANCELLED";
      readonly review: ReviewRecord;
      readonly cancellation: ReviewProcessingCancellation;
    }
  | {
      readonly kind: "SKIPPED";
      readonly status: Exclude<ReviewStatus, "PENDING">;
      readonly review: ReviewRecord;
      readonly reason: ReviewProcessingSkippedReason;
    };
