import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AiProviderError,
  AiReviewService,
  FakeAiReviewProvider,
  type AiProviderResult,
  type AiReviewExecution,
  type AiReviewRequest,
  type ReviewResult,
} from "../../../src/modules/ai/index.js";
import { InMemoryReviewRepository } from "../../../src/modules/review/in-memory-review.repository.js";
import {
  REVIEW_PROCESSING_TRANSITIONS,
  ReviewProcessingBoundaryError,
  ReviewProcessingService,
  type ReviewProcessingOutcome,
} from "../../../src/modules/review/processing/index.js";
import type {
  ReviewStatus,
  ReviewStatusTransition,
} from "../../../src/modules/review/review.types.js";

const REVIEW_ID = "review-processing-1";
const USER_ID = "user-processing-1";
const FIXED_NOW = new Date("2026-08-06T00:00:00.000Z");
const VALID_RESULT = {
  findings: [],
  schemaVersion: "v1",
  summary: "No actionable findings were detected.",
} as const;

class RecordingReviewRepository extends InMemoryReviewRepository {
  readonly transitions: Array<{
    readonly id: string;
    readonly transition: ReviewStatusTransition;
  }> = [];

  override async transitionForUser(userId: string, id: string, transition: ReviewStatusTransition) {
    this.transitions.push({
      id,
      transition: {
        fromStatuses: [...transition.fromStatuses],
        now: new Date(transition.now),
        toStatus: transition.toStatus,
      },
    });

    return super.transitionForUser(userId, id, transition);
  }

  override async finalizeForUser(
    userId: string,
    id: string,
    execution: AiReviewExecution<ReviewResult>,
    now: Date,
  ) {
    this.transitions.push({
      id,
      transition: {
        fromStatuses: ["PROCESSING"],
        now: new Date(now),
        toStatus: "COMPLETED",
      },
    });

    return super.finalizeForUser(userId, id, execution, now);
  }
}

class FinalizationErrorRepository extends RecordingReviewRepository {
  constructor(private readonly finalizationError: Error) {
    super();
  }

  override async finalizeForUser(
    ..._args: Parameters<InMemoryReviewRepository["finalizeForUser"]>
  ): Promise<Awaited<ReturnType<InMemoryReviewRepository["finalizeForUser"]>>> {
    void _args;
    throw this.finalizationError;
  }
}

class AlreadyCancelledOnCancelRepository extends RecordingReviewRepository {
  override async transitionForUser(userId: string, id: string, transition: ReviewStatusTransition) {
    if (transition.toStatus === "CANCELLED") {
      await super.transitionForUser(userId, id, transition);
      return null;
    }

    return super.transitionForUser(userId, id, transition);
  }
}

class FailedOnCancelRepository extends RecordingReviewRepository {
  override async transitionForUser(userId: string, id: string, transition: ReviewStatusTransition) {
    if (transition.toStatus === "CANCELLED") {
      await super.transitionForUser(userId, id, {
        fromStatuses: ["PROCESSING"],
        now: transition.now,
        toStatus: "FAILED",
      });
      return null;
    }

    return super.transitionForUser(userId, id, transition);
  }
}

class TerminalClaimRepository extends RecordingReviewRepository {
  constructor(
    private readonly terminalStatus: Extract<ReviewStatus, "COMPLETED" | "FAILED" | "CANCELLED">,
  ) {
    super();
  }

  override async transitionForUser(userId: string, id: string, transition: ReviewStatusTransition) {
    const result = await super.transitionForUser(userId, id, transition);

    if (transition.toStatus === "PROCESSING" && result) {
      return { ...result, status: this.terminalStatus };
    }

    return result;
  }
}

class AbortAfterValidResultAiReviewService extends AiReviewService {
  constructor(private readonly controller: AbortController) {
    super(new FakeAiReviewProvider([{ output: VALID_RESULT }]));
  }

  override async review(
    input: AiReviewRequest,
    signal?: AbortSignal,
  ): Promise<AiReviewExecution<ReviewResult>> {
    const execution = await super.review(input, signal);
    this.controller.abort();
    return execution;
  }
}

async function createReview(repository: InMemoryReviewRepository): Promise<void> {
  await repository.create({
    id: REVIEW_ID,
    language: "typescript",
    mode: "STANDARD",
    source: "const answer = 42;",
    userId: USER_ID,
  });
}

function createProcessing(
  repository: InMemoryReviewRepository,
  provider: FakeAiReviewProvider,
): ReviewProcessingService {
  return new ReviewProcessingService(
    repository,
    new AiReviewService(provider),
    () => new Date(FIXED_NOW),
  );
}

function request(signal?: AbortSignal) {
  return {
    reviewId: REVIEW_ID,
    userId: USER_ID,
    ...(signal === undefined ? {} : { signal }),
  };
}

describe("review processing orchestration", () => {
  it("keeps processing transitions explicit and bounded", () => {
    assert.deepEqual(REVIEW_PROCESSING_TRANSITIONS, {
      cancel: { fromStatuses: ["PROCESSING"], toStatus: "CANCELLED" },
      claim: { fromStatuses: ["PENDING"], toStatus: "PROCESSING" },
      complete: { fromStatuses: ["PROCESSING"], toStatus: "COMPLETED" },
      fail: { fromStatuses: ["PROCESSING"], toStatus: "FAILED" },
    });
  });

  it("claims a pending review once, calls Luna through AiReviewService, and completes it", async () => {
    const repository = new RecordingReviewRepository();
    await createReview(repository);
    const provider = new FakeAiReviewProvider([
      {
        output: VALID_RESULT,
        usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
      },
    ]);
    const processing = createProcessing(repository, provider);

    const outcome = await processing.process(request());

    assert.equal(outcome.kind, "COMPLETED");
    assert.equal(outcome.status, "COMPLETED");
    assert.deepEqual(
      (outcome as Extract<ReviewProcessingOutcome, { kind: "COMPLETED" }>).execution.result,
      VALID_RESULT,
    );
    assert.equal(provider.requests.length, 1);
    assert.equal(provider.requests[0]?.provider, "luna");
    assert.equal(provider.requests[0]?.model, "gpt-5.6-luna");
    const persisted = await repository.findResultForUser(USER_ID, REVIEW_ID);
    assert.ok(persisted);
    assert.equal(persisted.reviewId, REVIEW_ID);
    assert.equal(persisted.provider, "luna");
    assert.equal(persisted.model, "gpt-5.6-luna");
    assert.equal(persisted.reasoningEffort, "medium");
    assert.equal(persisted.attempts, 1);
    assert.ok(persisted.durationMs >= 0);
    assert.deepEqual(persisted.result, VALID_RESULT);
    assert.deepEqual(persisted.usage, { inputTokens: 10, outputTokens: 8, totalTokens: 18 });
    assert.deepEqual(
      repository.transitions.map(({ transition }) => ({
        fromStatuses: transition.fromStatuses,
        toStatus: transition.toStatus,
      })),
      [
        { fromStatuses: ["PENDING"], toStatus: "PROCESSING" },
        { fromStatuses: ["PROCESSING"], toStatus: "COMPLETED" },
      ],
    );
  });

  it("does not remap a repository finalization error as an AI failure", async () => {
    const finalizationError = new ReviewProcessingBoundaryError("FINALIZATION_CONFLICT");
    const repository = new FinalizationErrorRepository(finalizationError);
    await createReview(repository);
    const provider = new FakeAiReviewProvider([{ output: VALID_RESULT }]);

    await assert.rejects(
      createProcessing(repository, provider).process(request()),
      (error: unknown) => {
        assert.equal(error, finalizationError);
        return true;
      },
    );
    assert.equal(provider.requests.length, 1);
    assert.equal((await repository.findByIdForUser(USER_ID, REVIEW_ID))?.status, "PROCESSING");
    assert.equal(await repository.findResultForUser(USER_ID, REVIEW_ID), null);
    assert.deepEqual(
      repository.transitions.map(({ transition }) => transition.toStatus),
      ["PROCESSING"],
    );
  });

  it("returns an idempotent already-processing claim without invoking AI twice", async () => {
    const repository = new RecordingReviewRepository();
    await createReview(repository);
    let resolveProvider!: (result: AiProviderResult) => void;
    let markProviderStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    const provider = new FakeAiReviewProvider([
      async () => {
        markProviderStarted();
        return new Promise<AiProviderResult>((resolve) => {
          resolveProvider = resolve;
        });
      },
    ]);
    const processing = createProcessing(repository, provider);

    const firstRun = processing.process(request());
    await providerStarted;
    const secondRun = await processing.process(request());

    assert.equal(secondRun.kind, "SKIPPED");
    assert.equal(secondRun.reason, "ALREADY_PROCESSING");
    assert.equal(secondRun.status, "PROCESSING");
    assert.equal(secondRun.review.id, REVIEW_ID);
    assert.equal(secondRun.review.status, "PROCESSING");
    assert.equal(secondRun.review.userId, USER_ID);
    assert.equal(provider.requests.length, 1);

    resolveProvider({ output: VALID_RESULT });
    const firstOutcome = await firstRun;
    assert.equal(firstOutcome.kind, "COMPLETED");

    const completedRun = await processing.process(request());
    assert.equal(completedRun.kind, "SKIPPED");
    assert.equal(completedRun.reason, "ALREADY_COMPLETED");
    assert.equal(completedRun.status, "COMPLETED");
    assert.equal(provider.requests.length, 1);
  });

  it("maps provider failures to a typed FAILED result", async () => {
    const repository = new RecordingReviewRepository();
    await createReview(repository);
    const provider = new FakeAiReviewProvider([
      new AiProviderError("RATE_LIMITED", { retryable: true }),
    ]);
    const outcome = await createProcessing(repository, provider).process(request());

    assert.equal(outcome.kind, "FAILED");
    assert.deepEqual((outcome as Extract<ReviewProcessingOutcome, { kind: "FAILED" }>).failure, {
      code: "AI_PROVIDER_RATE_LIMITED",
      kind: "FAILURE",
      providerCode: "RATE_LIMITED",
      retryable: true,
    });
    assert.equal(outcome.status, "FAILED");
    assert.equal(outcome.review.id, REVIEW_ID);
    assert.equal(outcome.review.status, "FAILED");
    assert.equal(repository.transitions.at(-1)?.transition.toStatus, "FAILED");
    assert.equal(await repository.findResultForUser(USER_ID, REVIEW_ID), null);
  });

  it("maps exhausted structured-result validation to a typed FAILED result", async () => {
    const repository = new RecordingReviewRepository();
    await createReview(repository);
    const provider = new FakeAiReviewProvider([{ output: { invalid: true } }]);
    const outcome = await createProcessing(repository, provider).process(request());

    assert.equal(outcome.kind, "FAILED");
    assert.deepEqual((outcome as Extract<ReviewProcessingOutcome, { kind: "FAILED" }>).failure, {
      attempts: 2,
      code: "AI_RESULT_INVALID",
      kind: "FAILURE",
      retryable: false,
    });
    assert.equal(provider.requests.length, 2);
  });

  it("maps provider cancellation to CANCELLED without retrying or leaking provider errors", async () => {
    const repository = new RecordingReviewRepository();
    await createReview(repository);
    const provider = new FakeAiReviewProvider([new AiProviderError("CANCELLED")]);
    const outcome = await createProcessing(repository, provider).process(request());

    assert.deepEqual(
      (outcome as Extract<ReviewProcessingOutcome, { kind: "CANCELLED" }>).cancellation,
      {
        code: "CANCELLED",
        kind: "CANCELLATION",
        providerCode: "CANCELLED",
        source: "AI_PROVIDER",
      },
    );
    assert.equal(outcome.status, "CANCELLED");
    assert.equal(provider.requests.length, 1);
    assert.equal(repository.transitions.at(-1)?.transition.toStatus, "CANCELLED");
    assert.equal(await repository.findResultForUser(USER_ID, REVIEW_ID), null);
  });

  it("maps an already-aborted signal to CANCELLED before invoking the provider", async () => {
    const repository = new RecordingReviewRepository();
    await createReview(repository);
    const provider = new FakeAiReviewProvider([{ output: VALID_RESULT }]);
    const controller = new AbortController();
    controller.abort();

    const outcome = await createProcessing(repository, provider).process(
      request(controller.signal),
    );

    assert.equal(outcome.kind, "CANCELLED");
    assert.deepEqual(
      (outcome as Extract<ReviewProcessingOutcome, { kind: "CANCELLED" }>).cancellation,
      { code: "CANCELLED", kind: "CANCELLATION", source: "SIGNAL" },
    );
    assert.equal(provider.requests.length, 0);
    assert.equal(repository.transitions.at(-1)?.transition.toStatus, "CANCELLED");
  });

  it("cancels after a valid AI result when the caller aborts before finalization", async () => {
    const repository = new AlreadyCancelledOnCancelRepository();
    await createReview(repository);
    const controller = new AbortController();
    const processing = new ReviewProcessingService(
      repository,
      new AbortAfterValidResultAiReviewService(controller),
      () => new Date(FIXED_NOW),
    );

    const outcome = await processing.process(request(controller.signal));

    assert.equal(outcome.kind, "CANCELLED");
    assert.deepEqual(
      (outcome as Extract<ReviewProcessingOutcome, { kind: "CANCELLED" }>).cancellation,
      {
        code: "CANCELLED",
        kind: "CANCELLATION",
        source: "CONCURRENT_TRANSITION",
      },
    );
    assert.deepEqual(
      repository.transitions.map(({ transition }) => transition.toStatus),
      ["PROCESSING", "CANCELLED"],
    );
    assert.equal(
      repository.transitions.some(({ transition }) => transition.toStatus === "COMPLETED"),
      false,
    );
    assert.equal(await repository.findResultForUser(USER_ID, REVIEW_ID), null);
  });

  it("returns a retry-required terminal skip when cancellation loses to FAILED", async () => {
    const repository = new FailedOnCancelRepository();
    await createReview(repository);
    const provider = new FakeAiReviewProvider([new AiProviderError("CANCELLED")]);

    const outcome = await createProcessing(repository, provider).process(request());

    assert.equal(outcome.kind, "SKIPPED");
    assert.equal(outcome.reason, "RETRY_REQUIRED");
    assert.equal(outcome.status, "FAILED");
    assert.equal(outcome.review.status, "FAILED");
    assert.equal(provider.requests.length, 1);
    assert.equal(await repository.findResultForUser(USER_ID, REVIEW_ID), null);
  });

  it("does not invoke AI when the claim transition returns a terminal record", async () => {
    const terminalStatuses = ["CANCELLED", "FAILED", "COMPLETED"] as const;

    for (const terminalStatus of terminalStatuses) {
      const repository = new TerminalClaimRepository(terminalStatus);
      await createReview(repository);
      const provider = new FakeAiReviewProvider([{ output: VALID_RESULT }]);

      const outcome = await createProcessing(repository, provider).process(request());

      assert.equal(outcome.kind, "SKIPPED");
      assert.equal(outcome.status, terminalStatus);
      assert.equal(
        outcome.reason,
        terminalStatus === "COMPLETED" ? "ALREADY_COMPLETED" : "RETRY_REQUIRED",
      );
      assert.equal(outcome.review.status, terminalStatus);
      assert.equal(provider.requests.length, 0);
    }
  });

  it("does not reclaim a failed or cancelled review without an explicit retry transition", async () => {
    const repository = new RecordingReviewRepository();
    await createReview(repository);
    await repository.transitionForUser(USER_ID, REVIEW_ID, {
      fromStatuses: ["PENDING"],
      now: FIXED_NOW,
      toStatus: "FAILED",
    });
    repository.transitions.length = 0;
    const provider = new FakeAiReviewProvider([{ output: VALID_RESULT }]);

    const outcome = await createProcessing(repository, provider).process(request());

    assert.equal(outcome.kind, "SKIPPED");
    assert.equal(outcome.reason, "RETRY_REQUIRED");
    assert.equal(outcome.status, "FAILED");
    assert.equal(outcome.review.id, REVIEW_ID);
    assert.equal(outcome.review.status, "FAILED");
    assert.equal(provider.requests.length, 0);
    assert.equal(repository.transitions.length, 1);
  });

  it("raises a typed boundary error when the review is missing", async () => {
    const repository = new RecordingReviewRepository();
    const provider = new FakeAiReviewProvider([{ output: VALID_RESULT }]);

    await assert.rejects(
      createProcessing(repository, provider).process(request()),
      (error: unknown) => {
        assert.ok(error instanceof ReviewProcessingBoundaryError);
        assert.equal(error.code, "REVIEW_NOT_FOUND");
        return true;
      },
    );
    assert.equal(provider.requests.length, 0);
  });
});
