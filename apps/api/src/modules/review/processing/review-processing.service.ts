import { Inject, Injectable, Optional } from "@nestjs/common";

import { AiReviewService } from "../../ai/ai-review.service.js";
import { RedisCommandError, RedisUnavailableError } from "../../redis/redis.errors.js";
import { acquireReviewLock, releaseReviewLock } from "../../redis/redis.lock.js";
import { REDIS_COMMAND_EXECUTOR, type RedisCommandExecutor } from "../../redis/redis.types.js";
import { USAGE_REDIS_CONFIG, type UsageRedisConfig } from "../../usage/usage.config.js";
import {
  mapAiError,
  ReviewProcessingBoundaryError,
  type ReviewProcessingCancellation,
} from "./review-processing.errors.js";
import { createProcessingTransition } from "./review-processing.policy.js";
import type {
  ReviewProcessingClaim,
  ReviewProcessingOutcome,
  ReviewProcessingRepository,
  ReviewProcessingRequest,
} from "./review-processing.types.js";
import { REVIEW_REPOSITORY } from "../review.types.js";
import type { ReviewRecord } from "../review.types.js";
import type { ReviewResultRecord } from "../review-result.persistence.js";

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
      return retryRequired(claim.review, claim.status);
  }
}

function retryRequired(
  review: ReviewRecord,
  status: "FAILED" | "CANCELLED",
): Extract<ReviewProcessingOutcome, { readonly kind: "SKIPPED" }> {
  return {
    kind: "SKIPPED",
    reason: "RETRY_REQUIRED",
    review,
    status,
  };
}

function staleClaim(
  review: ReviewRecord,
): Extract<ReviewProcessingOutcome, { readonly kind: "SKIPPED" }> {
  return {
    kind: "SKIPPED",
    reason: "STALE_CLAIM",
    review,
    status: "PROCESSING",
  };
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

function lockContention(review: ReviewRecord): ReviewProcessingOutcome {
  switch (review.status) {
    case "COMPLETED":
      return {
        kind: "SKIPPED",
        reason: "ALREADY_COMPLETED",
        review,
        status: "COMPLETED",
      };
    case "PROCESSING":
      return {
        kind: "SKIPPED",
        reason: "ALREADY_PROCESSING",
        review,
        status: "PROCESSING",
      };
    default:
      throw new ReviewProcessingBoundaryError("CLAIM_CONFLICT");
  }
}

function isRedisLockFailure(error: unknown): boolean {
  return error instanceof RedisCommandError || error instanceof RedisUnavailableError;
}

@Injectable()
export class ReviewProcessingService {
  constructor(
    @Inject(REVIEW_REPOSITORY)
    private readonly repository: ReviewProcessingRepository,
    private readonly aiReviewService: AiReviewService,
    @Inject(REDIS_COMMAND_EXECUTOR)
    private readonly redisExecutor: RedisCommandExecutor,
    @Inject(USAGE_REDIS_CONFIG)
    private readonly redisConfig: UsageRedisConfig,
    @Optional()
    private readonly clock: ReviewProcessingClock = () => new Date(),
  ) {}

  async getResult(input: ReviewProcessingRequest): Promise<ReviewResultRecord> {
    const review = await this.findCurrentOrThrow(input);

    if (review.status !== "COMPLETED") {
      throw new ReviewProcessingBoundaryError("RESULT_NOT_READY");
    }

    const result = await this.repository.findResultForUser(input.userId, input.reviewId);

    if (!result) {
      throw new ReviewProcessingBoundaryError("RESULT_UNAVAILABLE");
    }

    return result;
  }

  async claim(input: ReviewProcessingRequest): Promise<ReviewProcessingClaim> {
    const claimed = await this.repository.transitionForUser(
      input.userId,
      input.reviewId,
      createProcessingTransition("claim", this.clock()),
    );

    if (claimed?.status === "PROCESSING") {
      return {
        generation: claimed.processingGeneration,
        kind: "CLAIMED",
        review: claimed,
      };
    }

    if (claimed) {
      return this.classifyNonClaimed(claimed);
    }

    return this.classifyNonClaimed(await this.findCurrentOrThrow(input));
  }

  async process(input: ReviewProcessingRequest): Promise<ReviewProcessingOutcome> {
    await this.findCurrentOrThrow(input);

    let lockToken: string;
    try {
      const lock = await acquireReviewLock(this.redisExecutor, this.redisConfig, {
        reviewId: input.reviewId,
      });

      if (!lock.acquired) {
        return lockContention(await this.findCurrentOrThrow(input));
      }

      if (lock.token === undefined) {
        throw new ReviewProcessingBoundaryError("PROCESSING_LOCK_UNAVAILABLE");
      }

      lockToken = lock.token;
    } catch (error: unknown) {
      if (isRedisLockFailure(error)) {
        throw new ReviewProcessingBoundaryError("PROCESSING_LOCK_UNAVAILABLE");
      }

      throw error;
    }

    try {
      return await this.processWithLock(input);
    } finally {
      await this.releaseLockBestEffort(input.reviewId, lockToken);
    }
  }

  private async processWithLock(input: ReviewProcessingRequest): Promise<ReviewProcessingOutcome> {
    const claim = await this.claim(input);

    if (claim.kind !== "CLAIMED") {
      return skipped(claim);
    }

    let execution: Awaited<ReturnType<AiReviewService["review"]>>;

    try {
      execution = await this.aiReviewService.review(
        {
          language: claim.review.language,
          mode: claim.review.mode,
          source: claim.review.source,
        },
        input.signal,
      );
    } catch (error: unknown) {
      const mapped = mapAiError(error, input.signal);

      if (mapped.kind === "CANCELLED") {
        return this.cancel(input, claim.generation, mapped.cancellation);
      }

      return this.fail(input, claim.generation, mapped.failure);
    }

    if (input.signal?.aborted) {
      return this.cancel(input, claim.generation, {
        code: "CANCELLED",
        kind: "CANCELLATION",
        source: "SIGNAL",
      });
    }

    return this.complete(input, claim.generation, execution);
  }

  /**
   * Redis release is best-effort: an unavailable or malformed release result
   * cannot safely be retried, so the bounded acquisition TTL is the fallback.
   */
  private async releaseLockBestEffort(reviewId: string, token: string): Promise<void> {
    try {
      await releaseReviewLock(this.redisExecutor, reviewId, token);
    } catch (error: unknown) {
      if (isRedisLockFailure(error)) {
        return;
      }

      throw error;
    }
  }

  private classifyNonClaimed(
    review: ReviewRecord,
  ): Exclude<ReviewProcessingClaim, { readonly kind: "CLAIMED" }> {
    switch (review.status) {
      case "PROCESSING":
        return { kind: "ALREADY_PROCESSING", review };
      case "COMPLETED":
        return { kind: "ALREADY_COMPLETED", review };
      case "FAILED":
      case "CANCELLED":
        return { kind: "NOT_CLAIMED", reason: "RETRY_REQUIRED", review, status: review.status };
      case "PENDING":
        throw new ReviewProcessingBoundaryError("CLAIM_CONFLICT");
    }
  }

  private async complete(
    input: ReviewProcessingRequest,
    expectedProcessingGeneration: number,
    execution: Awaited<ReturnType<AiReviewService["review"]>>,
  ): Promise<ReviewProcessingOutcome> {
    const completed = await this.repository.finalizeForUser(
      input.userId,
      input.reviewId,
      execution,
      this.clock(),
      expectedProcessingGeneration,
    );

    if (completed?.status === "COMPLETED") {
      return { execution, kind: "COMPLETED", review: completed, status: "COMPLETED" };
    }

    if (completed?.status === "CANCELLED") {
      return concurrentCancellation(completed);
    }

    if (completed?.status === "FAILED") {
      return retryRequired(completed, "FAILED");
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
      return retryRequired(current, "FAILED");
    }

    if (current.status === "PROCESSING") {
      return staleClaim(current);
    }

    throw new ReviewProcessingBoundaryError("FINALIZATION_CONFLICT");
  }

  private async fail(
    input: ReviewProcessingRequest,
    expectedProcessingGeneration: number,
    failure: Extract<ReturnType<typeof mapAiError>, { readonly kind: "FAILED" }>["failure"],
  ): Promise<ReviewProcessingOutcome> {
    const failed = await this.repository.transitionForUser(
      input.userId,
      input.reviewId,
      createProcessingTransition("fail", this.clock(), expectedProcessingGeneration),
    );

    if (failed?.status === "FAILED") {
      return { failure, kind: "FAILED", review: failed, status: "FAILED" };
    }

    if (failed?.status === "CANCELLED") {
      return concurrentCancellation(failed);
    }

    if (failed?.status === "COMPLETED") {
      return {
        kind: "SKIPPED",
        reason: "ALREADY_COMPLETED",
        review: failed,
        status: "COMPLETED",
      };
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

    if (current.status === "PROCESSING") {
      return staleClaim(current);
    }

    throw new ReviewProcessingBoundaryError("FINALIZATION_CONFLICT");
  }

  private async cancel(
    input: ReviewProcessingRequest,
    expectedProcessingGeneration: number,
    cancellation: ReviewProcessingCancellation,
  ): Promise<ReviewProcessingOutcome> {
    const cancelled = await this.repository.transitionForUser(
      input.userId,
      input.reviewId,
      createProcessingTransition("cancel", this.clock(), expectedProcessingGeneration),
    );

    if (cancelled?.status === "CANCELLED") {
      return { cancellation, kind: "CANCELLED", review: cancelled, status: "CANCELLED" };
    }

    if (cancelled?.status === "FAILED") {
      return retryRequired(cancelled, "FAILED");
    }

    if (cancelled?.status === "COMPLETED") {
      return {
        kind: "SKIPPED",
        reason: "ALREADY_COMPLETED",
        review: cancelled,
        status: "COMPLETED",
      };
    }

    const current = await this.findCurrentOrThrow(input);

    if (current.status === "CANCELLED") {
      return concurrentCancellation(current);
    }

    if (current.status === "COMPLETED") {
      return {
        kind: "SKIPPED",
        reason: "ALREADY_COMPLETED",
        review: current,
        status: "COMPLETED",
      };
    }

    if (current.status === "FAILED") {
      return retryRequired(current, "FAILED");
    }

    if (current.status === "PROCESSING") {
      return staleClaim(current);
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
