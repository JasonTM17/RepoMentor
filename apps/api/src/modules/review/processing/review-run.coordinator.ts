import { Inject, Injectable } from "@nestjs/common";

import { ReviewProcessingService } from "./review-processing.service.js";
import type {
  ReviewProcessingOutcome,
  ReviewProcessingRequest,
} from "./review-processing.types.js";

interface ActiveReviewRun {
  readonly controller: AbortController;
  readonly promise: Promise<ReviewProcessingOutcome>;
}

function runKey(userId: string, reviewId: string): string {
  return `${userId}\u0000${reviewId}`;
}

@Injectable()
export class ReviewRunCoordinator {
  // This map coalesces starts only within one Nest process. The existing Redis
  // lock and conditional durable transitions remain authoritative across
  // instances; cross-instance request coalescing is intentionally not claimed
  // by this bounded slice.
  private readonly activeRuns = new Map<string, ActiveReviewRun>();

  constructor(
    @Inject(ReviewProcessingService) private readonly processing: ReviewProcessingService,
  ) {}

  process(input: Omit<ReviewProcessingRequest, "signal">): Promise<ReviewProcessingOutcome> {
    const key = runKey(input.userId, input.reviewId);
    const existing = this.activeRuns.get(key);

    if (existing) {
      return existing.promise;
    }

    const controller = new AbortController();
    const promise = this.processing.process({ ...input, signal: controller.signal }).finally(() => {
      if (this.activeRuns.get(key)?.promise === promise) {
        this.activeRuns.delete(key);
      }
    });

    this.activeRuns.set(key, { controller, promise });
    return promise;
  }

  cancel(userId: string, reviewId: string): boolean {
    const run = this.activeRuns.get(runKey(userId, reviewId));

    if (!run) {
      return false;
    }

    run.controller.abort();
    return true;
  }

  async waitForIdle(userId: string, reviewId: string): Promise<void> {
    const run = this.activeRuns.get(runKey(userId, reviewId));

    if (run) {
      await run.promise.catch(() => undefined);
    }
  }
}
