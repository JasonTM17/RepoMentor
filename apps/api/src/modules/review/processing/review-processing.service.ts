import { AiReviewService } from "../../ai/ai-review.service.js";
import { mapAiError, ReviewProcessingBoundaryError } from "./review-processing.errors.js";
import { createProcessingTransition } from "./review-processing.policy.js";
import type {
  ReviewProcessingClaim,
  ReviewProcessingOutcome,
  ReviewProcessingRepository,
  ReviewProcessingRequest,
} from "./review-processing.types.js";
import type { ReviewRecord } from "../review.types.js";

export type ReviewProcessingClock = () => Date;

function skipped(
  claim: Exclude<ReviewProcessingClaim, { readonly kind: "CLAIMED" }>,
): Extract<ReviewProcessingOutcome, { readonly kind: "SKIPPED" }> {
  switch (claim.kind) {
    case "ALREADY_COMPLETED":
      return {
        kind: "SKIPPED",
        reason: "ALREADY_COMPLETED",
        review: claim.review,
        status: "COMPLETED",
      };
    case "ALREADY_PROCESSING":
      return {
        kind: "SKIPPED",
        reason: "ALREADY_PROCESSING",
        review: claim.review,
        status: "PROCESSING",
      };
    case "NOT_CLAIMED":
      return {
        kind: "SKIPPED",
        reason: "RETRY_REQUIRED",
        review: claim.review,
        status: claim.status,
      };
  }
}

function concurrentCancellation(
  review: ReviewRecord,
): Extract<ReviewProcessingOutcome, { readonly kind: "CANCELLED" }> {
  return {
    cancellation: {
      code: "CANCELLED",
      kind: "CANCELLATION",
      source: "CONCURRENT_TRANSITION",
    },
    kind: "CANCELLED",
    review,
    status: "CANCELLED",
  };
}

export class ReviewProcessingService {
  constructor(
    private readonly repository: ReviewProcessingRepository,
    private readonly aiReviewService: AiReviewService,
    private readonly clock: ReviewProcessingClock = () => new Date(),
  ) {}

  async claim(input: ReviewProcessingRequest): Promise<ReviewProcessingClaim> {
    const claimed = await this.repository.transitionForUser(
      input.userId,
      input.reviewId,
      createProcessingTransition("claim", this.clock()),
    );

    if (claimed) {
      return { kind: "CLAIMED", review: claimed };
    }

    const current = await this.findCurrentOrThrow(input);

    switch (current.status) {
      case "PROCESSING":
        return { kind: "ALREADY_PROCESSING", review: current };
      case "COMPLETED":
        return { kind: "ALREADY_COMPLETED", review: current };
      case "FAILED":
      case "CANCELLED":
        return {
          kind: "NOT_CLAIMED",
          reason: "RETRY_REQUIRED",
          review: current,
          status: current.status,
        };
      case "PENDING":
        throw new ReviewProcessingBoundaryError("CLAIM_CONFLICT");
    }
  }

  async process(input: ReviewProcessingRequest): Promise<ReviewProcessingOutcome> {
    const claim = await this.claim(input);

    if (claim.kind !== "CLAIMED") {
      return skipped(claim);
    }

    try {
      const execution = await this.aiReviewService.review(
        {
          language: claim.review.language,
          mode: claim.review.mode,
          source: claim.review.source,
        },
        input.signal,
      );

      return await this.complete(input, execution);
    } catch (error: unknown) {
      const mapped = mapAiError(error, input.signal);

      if (mapped.kind === "CANCELLED") {
        return this.cancel(input, mapped.cancellation);
      }

      return this.fail(input, mapped.failure);
    }
  }

  private async complete(
    input: ReviewProcessingRequest,
    execution: Awaited<ReturnType<AiReviewService["review"]>>,
  ): Promise<ReviewProcessingOutcome> {
    const completed = await this.repository.transitionForUser(
      input.userId,
      input.reviewId,
      createProcessingTransition("complete", this.clock()),
    );

    if (completed) {
      return { execution, kind: "COMPLETED", review: completed, status: "COMPLETED" };
    }

    const current = await this.findCurrentOrThrow(input);

    if (current.status === "COMPLETED") {
      return {
        kind: "SKIPPED",
        reason: "ALREADY_COMPLETED",
        review: current,
        status: "COMPLETED",
      };
    }

    if (current.status === "CANCELLED") {
      return concurrentCancellation(current);
    }

    throw new ReviewProcessingBoundaryError("FINALIZATION_CONFLICT");
  }

  private async fail(
    input: ReviewProcessingRequest,
    failure: Extract<ReturnType<typeof mapAiError>, { readonly kind: "FAILED" }>["failure"],
  ): Promise<ReviewProcessingOutcome> {
    const failed = await this.repository.transitionForUser(
      input.userId,
      input.reviewId,
      createProcessingTransition("fail", this.clock()),
    );

    if (failed) {
      return { failure, kind: "FAILED", review: failed, status: "FAILED" };
    }

    const current = await this.findCurrentOrThrow(input);

    if (current.status === "COMPLETED") {
      return {
        kind: "SKIPPED",
        reason: "ALREADY_COMPLETED",
        review: current,
        status: "COMPLETED",
      };
    }

    if (current.status === "CANCELLED") {
      return concurrentCancellation(current);
    }

    if (current.status === "FAILED") {
      return { failure, kind: "FAILED", review: current, status: "FAILED" };
    }

    throw new ReviewProcessingBoundaryError("FINALIZATION_CONFLICT");
  }

  private async cancel(
    input: ReviewProcessingRequest,
    cancellation: Extract<
      ReturnType<typeof mapAiError>,
      { readonly kind: "CANCELLED" }
    >["cancellation"],
  ): Promise<ReviewProcessingOutcome> {
    const cancelled = await this.repository.transitionForUser(
      input.userId,
      input.reviewId,
      createProcessingTransition("cancel", this.clock()),
    );

    if (cancelled) {
      return { cancellation, kind: "CANCELLED", review: cancelled, status: "CANCELLED" };
    }

    const current = await this.findCurrentOrThrow(input);

    if (current.status === "CANCELLED") {
      return { cancellation, kind: "CANCELLED", review: current, status: "CANCELLED" };
    }

    if (current.status === "COMPLETED") {
      return {
        kind: "SKIPPED",
        reason: "ALREADY_COMPLETED",
        review: current,
        status: "COMPLETED",
      };
    }

    throw new ReviewProcessingBoundaryError("FINALIZATION_CONFLICT");
  }

  private async findCurrentOrThrow(input: ReviewProcessingRequest): Promise<ReviewRecord> {
    const current = await this.repository.findByIdForUser(input.userId, input.reviewId);

    if (!current) {
      throw new ReviewProcessingBoundaryError("REVIEW_NOT_FOUND");
    }

    return current;
  }
}
