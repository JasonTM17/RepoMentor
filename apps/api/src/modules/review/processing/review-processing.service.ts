import { performance } from "node:perf_hooks";

import { Inject, Injectable, Optional } from "@nestjs/common";

import { AiReviewService } from "../../ai/ai-review.service.js";
import { RedisCommandError, RedisUnavailableError } from "../../redis/redis.errors.js";
import { acquireReviewLock, releaseReviewLock, renewReviewLock } from "../../redis/redis.lock.js";
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

export interface ReviewProcessingTimerHandle {
  unref(): void;
}

export interface ReviewProcessingTimer {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): ReviewProcessingTimerHandle;
  clearTimeout(handle: ReviewProcessingTimerHandle): void;
}

const DEFAULT_REVIEW_PROCESSING_TIMER: ReviewProcessingTimer = {
  now: () => performance.now(),
  setTimeout(callback, delayMs) {
    return setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    clearTimeout(handle as NodeJS.Timeout);
  },
};

const LOCK_RENEWAL_ABORT = Symbol("LOCK_RENEWAL_ABORT");

function createLinkedAbortController(callerSignal: AbortSignal | undefined): {
  readonly controller: AbortController;
  readonly dispose: () => void;
} {
  const controller = new AbortController();

  if (callerSignal?.aborted) {
    controller.abort();
    return { controller, dispose: () => undefined };
  }

  if (callerSignal === undefined) {
    return { controller, dispose: () => undefined };
  }

  const onAbort = (): void => {
    controller.abort();
  };
  callerSignal.addEventListener("abort", onAbort, { once: true });

  return {
    controller,
    dispose: () => callerSignal.removeEventListener("abort", onAbort),
  };
}

/**
 * Redis lease loss is an observation; this class turns it into a durable
 * conditional review transition before a delayed terminal write can win.
 */
class ReviewProcessingLeaseFence {
  private claimedGeneration: number | undefined;
  private fencePromise: Promise<ReviewRecord | null> | undefined;
  private lost = false;

  constructor(
    private readonly fence: (expectedProcessingGeneration: number) => Promise<ReviewRecord | null>,
  ) {}

  setClaimedGeneration(generation: number): void {
    this.claimedGeneration = generation;
    this.startIfNeeded();
  }

  markLost(): void {
    this.lost = true;
    this.startIfNeeded();
  }

  wait(): Promise<ReviewRecord | null> {
    return this.fencePromise ?? Promise.resolve(null);
  }

  private startIfNeeded(): void {
    const generation = this.claimedGeneration;

    if (!this.lost || generation === undefined || this.fencePromise !== undefined) {
      return;
    }

    this.fencePromise = Promise.resolve().then(() => this.fence(generation));
    void this.fencePromise.catch(() => undefined);
  }
}

class ReviewLockKeepalive {
  private readonly lostPromise: Promise<void>;
  private resolveLost!: () => void;
  private renewalTimer: ReviewProcessingTimerHandle | undefined;
  private watchdogTimer: ReviewProcessingTimerHandle | undefined;
  private renewalInFlight = false;
  private stopped = false;
  private lost = false;
  private cycleSequence = 0;

  constructor(
    private readonly executor: RedisCommandExecutor,
    private readonly config: UsageRedisConfig,
    private readonly reviewId: string,
    private readonly token: string,
    private readonly timer: ReviewProcessingTimer,
    private readonly onLost: () => void,
  ) {
    this.lostPromise = new Promise<void>((resolve) => {
      this.resolveLost = resolve;
    });
  }

  start(): void {
    this.scheduleCycle(this.timer.now());
  }

  stop(): void {
    this.stopped = true;
    this.clearRenewalTimer();
    this.clearWatchdogTimer();
  }

  isLost(): boolean {
    return this.lost;
  }

  waitForLoss(): Promise<void> {
    return this.lostPromise;
  }

  private scheduleCycle(startedAt: number): void {
    const cycle = ++this.cycleSequence;
    const leaseMs = this.config.lockTtlMs;
    const renewalDeadline = startedAt + leaseMs / 3;
    const watchdogDeadline = startedAt + (leaseMs * 2) / 3;

    this.renewalTimer = this.scheduleAt(renewalDeadline, () => {
      if (this.cycleSequence !== cycle) {
        return;
      }

      this.renewalTimer = undefined;

      if (this.stopped || this.lost) {
        return;
      }

      if (this.timer.now() >= watchdogDeadline || this.renewalInFlight) {
        this.lose();
        return;
      }

      this.renewalInFlight = true;
      void renewReviewLock(this.executor, this.config, {
        reviewId: this.reviewId,
        token: this.token,
      }).then(
        (renewed) => {
          this.renewalInFlight = false;

          if (this.stopped || this.lost) {
            return;
          }

          if (this.cycleSequence !== cycle) {
            return;
          }

          const completedAt = this.timer.now();

          if (!renewed || completedAt >= watchdogDeadline) {
            this.lose();
            return;
          }

          this.clearWatchdogTimer();
          this.scheduleCycle(completedAt);
        },
        () => {
          this.renewalInFlight = false;
          this.lose();
        },
      );
    });

    this.watchdogTimer = this.scheduleAt(watchdogDeadline, () => {
      if (this.cycleSequence !== cycle) {
        return;
      }

      this.watchdogTimer = undefined;

      if (this.stopped || this.lost) {
        return;
      }

      this.lose();
    });
  }

  private scheduleAt(deadline: number, callback: () => void): ReviewProcessingTimerHandle {
    const handle = this.timer.setTimeout(callback, Math.max(0, deadline - this.timer.now()));
    handle.unref();
    return handle;
  }

  private clearRenewalTimer(): void {
    if (this.renewalTimer !== undefined) {
      this.timer.clearTimeout(this.renewalTimer);
      this.renewalTimer = undefined;
    }
  }

  private clearWatchdogTimer(): void {
    if (this.watchdogTimer !== undefined) {
      this.timer.clearTimeout(this.watchdogTimer);
      this.watchdogTimer = undefined;
    }
  }

  private lose(): void {
    if (this.stopped || this.lost) {
      return;
    }

    this.lost = true;
    this.onLost();
    this.resolveLost();
  }
}

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
    @Optional()
    private readonly timer: ReviewProcessingTimer = DEFAULT_REVIEW_PROCESSING_TIMER,
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

    const linked = createLinkedAbortController(input.signal);
    const leaseFence = new ReviewProcessingLeaseFence((expectedProcessingGeneration) =>
      this.repository.fenceProcessingForUser(
        input.userId,
        input.reviewId,
        this.clock(),
        expectedProcessingGeneration,
      ),
    );
    const keepalive = new ReviewLockKeepalive(
      this.redisExecutor,
      this.redisConfig,
      input.reviewId,
      lockToken,
      this.timer,
      () => {
        leaseFence.markLost();
        linked.controller.abort();
      },
    );

    try {
      keepalive.start();
      return await this.processWithLock(input, linked.controller.signal, keepalive, leaseFence);
    } finally {
      keepalive.stop();
      linked.dispose();
      await this.releaseLockBestEffort(input.reviewId, lockToken);
    }
  }

  private async processWithLock(
    input: ReviewProcessingRequest,
    providerSignal: AbortSignal,
    keepalive: ReviewLockKeepalive,
    leaseFence: ReviewProcessingLeaseFence,
  ): Promise<ReviewProcessingOutcome> {
    if (keepalive.isLost() && !input.signal?.aborted) {
      throw new ReviewProcessingBoundaryError("PROCESSING_LOCK_UNAVAILABLE");
    }

    const claim = await this.claim(input);

    if (claim.kind !== "CLAIMED") {
      if (keepalive.isLost() && !input.signal?.aborted) {
        throw new ReviewProcessingBoundaryError("PROCESSING_LOCK_UNAVAILABLE");
      }

      return skipped(claim);
    }

    leaseFence.setClaimedGeneration(claim.generation);

    if (keepalive.isLost()) {
      return this.cancelAfterLeaseLoss(
        input,
        claim.generation,
        leaseFence,
        this.lockLossCancellation(input),
      );
    }

    let execution: Awaited<ReturnType<AiReviewService["review"]>>;

    try {
      const executionPromise = this.aiReviewService.review(
        {
          language: claim.review.language,
          learnerLevel: claim.review.learnerLevel,
          mode: claim.review.mode,
          source: claim.review.source,
          ...(claim.review.context === undefined ? {} : { context: claim.review.context }),
          ...(claim.review.title === undefined ? {} : { title: claim.review.title }),
        },
        providerSignal,
      );
      const lockLossPromise = keepalive.waitForLoss().then(() => {
        throw LOCK_RENEWAL_ABORT;
      });

      execution = await Promise.race([executionPromise, lockLossPromise]);
    } catch (error: unknown) {
      if (input.signal?.aborted) {
        const cancellation = {
          code: "CANCELLED",
          kind: "CANCELLATION",
          source: "SIGNAL",
        } as const;

        return keepalive.isLost()
          ? this.cancelAfterLeaseLoss(input, claim.generation, leaseFence, cancellation)
          : this.cancel(input, claim.generation, cancellation);
      }

      if (keepalive.isLost()) {
        return this.cancelAfterLeaseLoss(
          input,
          claim.generation,
          leaseFence,
          this.lockLossCancellation(input),
        );
      }

      const mapped = mapAiError(error, input.signal);

      if (mapped.kind === "CANCELLED") {
        return this.cancel(input, claim.generation, mapped.cancellation);
      }

      return this.runFinalizationWithLock(input, claim.generation, keepalive, leaseFence, () =>
        this.fail(input, claim.generation, mapped.failure),
      );
    }

    if (input.signal?.aborted) {
      const cancellation = {
        code: "CANCELLED",
        kind: "CANCELLATION",
        source: "SIGNAL",
      } as const;

      return keepalive.isLost()
        ? this.cancelAfterLeaseLoss(input, claim.generation, leaseFence, cancellation)
        : this.cancel(input, claim.generation, cancellation);
    }

    if (keepalive.isLost()) {
      return this.cancelAfterLeaseLoss(
        input,
        claim.generation,
        leaseFence,
        this.lockLossCancellation(input),
      );
    }

    return this.runFinalizationWithLock(input, claim.generation, keepalive, leaseFence, () =>
      this.complete(input, claim.generation, execution),
    );
  }

  private lockLossCancellation(input: ReviewProcessingRequest): ReviewProcessingCancellation {
    if (input.signal?.aborted) {
      return {
        code: "CANCELLED",
        kind: "CANCELLATION",
        source: "SIGNAL",
      };
    }

    return {
      code: "CANCELLED",
      kind: "CANCELLATION",
      source: "LOCK_RENEWAL",
    };
  }

  private async runFinalizationWithLock(
    input: ReviewProcessingRequest,
    expectedProcessingGeneration: number,
    keepalive: ReviewLockKeepalive,
    leaseFence: ReviewProcessingLeaseFence,
    finalize: () => Promise<ReviewProcessingOutcome>,
  ): Promise<ReviewProcessingOutcome> {
    const lockLossPromise = keepalive.waitForLoss().then(() => {
      throw LOCK_RENEWAL_ABORT;
    });

    if (keepalive.isLost()) {
      return this.cancelAfterLeaseLoss(
        input,
        expectedProcessingGeneration,
        leaseFence,
        this.lockLossCancellation(input),
      );
    }

    // Defer invocation until the loss sentinel is armed. The repository fence
    // below remains the authority for a loss racing the terminal DB operation.
    const finalizationPromise = Promise.resolve().then(finalize);
    void finalizationPromise.catch(() => undefined);

    try {
      const outcome = await Promise.race([finalizationPromise, lockLossPromise]);

      if (input.signal?.aborted) {
        const cancellation = {
          code: "CANCELLED",
          kind: "CANCELLATION",
          source: "SIGNAL",
        } as const;

        return keepalive.isLost()
          ? this.cancelAfterLeaseLoss(input, expectedProcessingGeneration, leaseFence, cancellation)
          : this.cancel(input, expectedProcessingGeneration, cancellation);
      }

      if (keepalive.isLost()) {
        return this.cancelAfterLeaseLoss(
          input,
          expectedProcessingGeneration,
          leaseFence,
          this.lockLossCancellation(input),
        );
      }

      return outcome;
    } catch (error: unknown) {
      if (input.signal?.aborted) {
        const cancellation = {
          code: "CANCELLED",
          kind: "CANCELLATION",
          source: "SIGNAL",
        } as const;

        return keepalive.isLost()
          ? this.cancelAfterLeaseLoss(input, expectedProcessingGeneration, leaseFence, cancellation)
          : this.cancel(input, expectedProcessingGeneration, cancellation);
      }

      if (keepalive.isLost() || error === LOCK_RENEWAL_ABORT) {
        return this.cancelAfterLeaseLoss(
          input,
          expectedProcessingGeneration,
          leaseFence,
          this.lockLossCancellation(input),
        );
      }

      throw error;
    }
  }

  private async cancelAfterLeaseLoss(
    input: ReviewProcessingRequest,
    expectedProcessingGeneration: number,
    leaseFence: ReviewProcessingLeaseFence,
    cancellation: ReviewProcessingCancellation,
  ): Promise<ReviewProcessingOutcome> {
    let fenceFailed = false;
    let fenceError: unknown;

    try {
      const fenced = await leaseFence.wait();

      if (fenced?.status === "CANCELLED") {
        return { cancellation, kind: "CANCELLED", review: fenced, status: "CANCELLED" };
      }
    } catch (error: unknown) {
      fenceFailed = true;
      fenceError = error;
    }

    // A rejected lease fence must not leave the already-started terminal
    // promise unguarded. The expected-generation cancellation is a fallback
    // durable fence; preserve the original fence error for the caller.
    const fallback = await this.cancel(input, expectedProcessingGeneration, cancellation);

    if (fenceFailed && fallback.status === "CANCELLED") {
      throw fenceError;
    }

    return fallback;
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
      createProcessingTransition(
        "fail",
        this.clock(),
        expectedProcessingGeneration,
        failure.retryable,
      ),
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
