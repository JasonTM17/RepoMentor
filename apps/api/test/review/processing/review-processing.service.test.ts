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
import { ReviewService } from "../../../src/modules/review/review.service.js";
import { acquireReviewLock } from "../../../src/modules/redis/redis.lock.js";
import {
  RedisCommandError,
  RedisUnavailableError,
  type RedisOperation,
} from "../../../src/modules/redis/redis.errors.js";
import type {
  RedisCommandExecutor,
  RedisEvalOptions,
  RedisSetOptions,
} from "../../../src/modules/redis/redis.types.js";
import {
  REVIEW_PROCESSING_TRANSITIONS,
  ReviewProcessingBoundaryError,
  ReviewProcessingService,
  type ReviewProcessingTimer,
  type ReviewProcessingTimerHandle,
  type ReviewProcessingOutcome,
} from "../../../src/modules/review/processing/index.js";
import type {
  ReviewStatus,
  ReviewStatusTransition,
} from "../../../src/modules/review/review.types.js";
import {
  USAGE_DEFAULT_DAILY_LIMITS,
  USAGE_DEFAULT_REDIS_CONFIG,
  type UsageRedisConfig,
} from "../../../src/modules/usage/usage.config.js";

const REVIEW_ID = "review-processing-1";
const USER_ID = "user-processing-1";
const FIXED_NOW = new Date("2026-08-06T00:00:00.000Z");
const VALID_RESULT = {
  education: {
    diff: null,
    generatedTests: [],
    improvedSource: null,
    learningQuestions: [],
  },
  findings: [],
  schemaVersion: "v1",
  summary: "No actionable findings were detected.",
} as const;
const STALE_RESULT = {
  education: {
    diff: null,
    generatedTests: [],
    improvedSource: null,
    learningQuestions: [],
  },
  findings: [],
  schemaVersion: "v1",
  summary: "Stale run must never persist this result.",
} as const;
const LIVE_RESULT = {
  education: {
    diff: null,
    generatedTests: [],
    improvedSource: null,
    learningQuestions: [],
  },
  findings: [],
  schemaVersion: "v1",
  summary: "The retried run owns this result.",
} as const;
const OTHER_USER_ID = "review-processing-other-user";

function processingRedisConfig(overrides: Partial<UsageRedisConfig> = {}): UsageRedisConfig {
  return {
    authenticatedDailyLimits: { ...USAGE_DEFAULT_DAILY_LIMITS },
    ...USAGE_DEFAULT_REDIS_CONFIG,
    ...overrides,
  };
}

class ProcessingRedisExecutor implements RedisCommandExecutor {
  readonly evalCalls: Array<{
    readonly options: RedisEvalOptions;
    readonly operation: RedisOperation;
    readonly script: string;
  }> = [];
  readonly setCalls: Array<{
    readonly key: string;
    readonly operation: RedisOperation;
    readonly options: RedisSetOptions;
    readonly value: string;
  }> = [];
  acquisitionError: Error | undefined;
  renewalError: Error | undefined;
  renewalPending: Promise<unknown> | undefined;
  renewalResult: boolean | undefined;
  renewalHook: (() => void) | undefined;
  renewalCalls = 0;
  activeRenewals = 0;
  maxConcurrentRenewals = 0;
  releaseError: Error | undefined;
  private heldToken: string | undefined;

  async eval(
    script: string,
    options: RedisEvalOptions,
    operation: RedisOperation,
  ): Promise<unknown> {
    this.evalCalls.push({
      options: { arguments: [...options.arguments], keys: [...options.keys] },
      operation,
      script,
    });

    if (operation === "lock-renewal") {
      this.renewalCalls += 1;
      this.activeRenewals += 1;
      this.maxConcurrentRenewals = Math.max(this.maxConcurrentRenewals, this.activeRenewals);

      try {
        if (this.renewalError) {
          throw this.renewalError;
        }

        this.renewalHook?.();

        if (this.renewalPending !== undefined) {
          return await this.renewalPending;
        }

        if (this.renewalResult !== undefined) {
          return this.renewalResult ? 1 : 0;
        }

        return this.heldToken === options.arguments[0] ? 1 : 0;
      } finally {
        this.activeRenewals -= 1;
      }
    }

    if (operation !== "lock-release") {
      throw new RedisCommandError(operation);
    }

    if (this.releaseError) {
      throw this.releaseError;
    }

    if (this.heldToken === options.arguments[0]) {
      this.heldToken = undefined;
      return 1;
    }

    return 0;
  }

  async set(
    key: string,
    value: string,
    options: RedisSetOptions,
    operation: RedisOperation,
  ): Promise<"OK" | null> {
    this.setCalls.push({
      key,
      operation,
      options: { ...options },
      value,
    });

    if (operation !== "lock-acquisition") {
      throw new RedisCommandError(operation);
    }

    if (this.acquisitionError) {
      throw this.acquisitionError;
    }

    if (this.heldToken !== undefined) {
      return null;
    }

    this.heldToken = value;
    return "OK";
  }

  hasHeldLock(): boolean {
    return this.heldToken !== undefined;
  }
}

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
        ...(transition.expectedProcessingGeneration === undefined
          ? {}
          : { expectedProcessingGeneration: transition.expectedProcessingGeneration }),
      },
    });

    return super.transitionForUser(userId, id, transition);
  }

  override async finalizeForUser(
    userId: string,
    id: string,
    execution: AiReviewExecution<ReviewResult>,
    now: Date,
    expectedProcessingGeneration: number,
  ) {
    this.transitions.push({
      id,
      transition: {
        fromStatuses: ["PROCESSING"],
        now: new Date(now),
        toStatus: "COMPLETED",
        expectedProcessingGeneration,
      },
    });

    return super.finalizeForUser(userId, id, execution, now, expectedProcessingGeneration);
  }

  override async fenceProcessingForUser(
    userId: string,
    id: string,
    now: Date,
    expectedProcessingGeneration: number,
  ) {
    this.transitions.push({
      id,
      transition: {
        fromStatuses: ["PROCESSING"],
        now: new Date(now),
        toStatus: "CANCELLED",
        expectedProcessingGeneration,
      },
    });

    return super.fenceProcessingForUser(userId, id, now, expectedProcessingGeneration);
  }
}

class DelayedTerminalRepository extends RecordingReviewRepository {
  readonly terminalSettled: Promise<void>;
  readonly terminalStarted: Promise<void>;
  releaseTerminal!: () => void;
  private readonly terminalGate: Promise<void>;
  private resolveTerminalSettled!: () => void;
  private resolveTerminalStarted!: () => void;
  private terminalStartedResolved = false;

  constructor() {
    super();
    this.terminalGate = new Promise<void>((resolve) => {
      this.releaseTerminal = resolve;
    });
    this.terminalSettled = new Promise<void>((resolve) => {
      this.resolveTerminalSettled = resolve;
    });
    this.terminalStarted = new Promise<void>((resolve) => {
      this.resolveTerminalStarted = resolve;
    });
  }

  override async finalizeForUser(
    userId: string,
    id: string,
    execution: AiReviewExecution<ReviewResult>,
    now: Date,
    expectedProcessingGeneration: number,
  ) {
    this.markTerminalStarted();
    await this.terminalGate;

    try {
      return await super.finalizeForUser(userId, id, execution, now, expectedProcessingGeneration);
    } finally {
      this.resolveTerminalSettled();
    }
  }

  override async transitionForUser(userId: string, id: string, transition: ReviewStatusTransition) {
    if (transition.toStatus !== "FAILED") {
      return super.transitionForUser(userId, id, transition);
    }

    this.markTerminalStarted();
    await this.terminalGate;

    try {
      return await super.transitionForUser(userId, id, transition);
    } finally {
      this.resolveTerminalSettled();
    }
  }

  private markTerminalStarted(): void {
    if (this.terminalStartedResolved) {
      return;
    }

    this.terminalStartedResolved = true;
    this.resolveTerminalStarted();
  }
}

class FenceFailureDelayedTerminalRepository extends DelayedTerminalRepository {
  constructor(private readonly fenceError: Error) {
    super();
  }

  override async fenceProcessingForUser(
    ..._args: Parameters<InMemoryReviewRepository["fenceProcessingForUser"]>
  ): Promise<Awaited<ReturnType<InMemoryReviewRepository["fenceProcessingForUser"]>>> {
    void _args;
    throw this.fenceError;
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
  redisExecutor = new ProcessingRedisExecutor(),
  config = processingRedisConfig(),
  timer?: ReviewProcessingTimer,
): ReviewProcessingService {
  return new ReviewProcessingService(
    repository,
    new AiReviewService(provider),
    redisExecutor,
    config,
    () => new Date(FIXED_NOW),
    timer,
  );
}

class FakeProcessingTimer implements ReviewProcessingTimer {
  private nowMs = 0;
  private nextId = 1;
  private readonly handles = new Map<number, FakeProcessingTimerHandle>();

  now(): number {
    return this.nowMs;
  }

  setTimeout(callback: () => void, delayMs: number): ReviewProcessingTimerHandle {
    const handle: FakeProcessingTimerHandle = {
      callback,
      dueAt: this.nowMs + delayMs,
      id: this.nextId++,
      unrefCalls: 0,
      unref() {
        handle.unrefCalls += 1;
      },
    };
    this.handles.set(handle.id, handle);
    return handle;
  }

  clearTimeout(handle: ReviewProcessingTimerHandle): void {
    this.handles.delete((handle as FakeProcessingTimerHandle).id);
  }

  async advance(milliseconds: number): Promise<void> {
    this.nowMs += milliseconds;

    while (true) {
      const due = [...this.handles.values()]
        .filter((handle) => handle.dueAt <= this.nowMs)
        .sort((left, right) => left.dueAt - right.dueAt || left.id - right.id);

      if (due.length === 0) {
        return;
      }

      for (const handle of due) {
        this.handles.delete(handle.id);
        handle.callback();
      }

      await Promise.resolve();
      await Promise.resolve();
    }
  }

  pendingCount(): number {
    return this.handles.size;
  }
}

interface FakeProcessingTimerHandle extends ReviewProcessingTimerHandle {
  readonly callback: () => void;
  readonly dueAt: number;
  readonly id: number;
  unrefCalls: number;
}

class DelayedClaimProcessingService extends ReviewProcessingService {
  readonly claimStarted: Promise<void>;
  private readonly claimGate: Promise<void>;
  private resolveClaimStarted!: () => void;
  releaseClaim!: () => void;
  private readonly testRepository: InMemoryReviewRepository;

  constructor(
    repository: InMemoryReviewRepository,
    provider: FakeAiReviewProvider,
    redisExecutor: ProcessingRedisExecutor,
    config: UsageRedisConfig,
    timer: ReviewProcessingTimer,
  ) {
    super(
      repository,
      new AiReviewService(provider),
      redisExecutor,
      config,
      () => new Date(FIXED_NOW),
      timer,
    );
    this.testRepository = repository;
    this.claimStarted = new Promise<void>((resolve) => {
      this.resolveClaimStarted = resolve;
    });
    this.claimGate = new Promise<void>((resolve) => {
      this.releaseClaim = resolve;
    });
  }

  override async claim(
    input: Parameters<ReviewProcessingService["claim"]>[0],
  ): ReturnType<ReviewProcessingService["claim"]> {
    this.resolveClaimStarted();
    await this.claimGate;
    const review = await this.testRepository.findByIdForUser(input.userId, input.reviewId);
    assert.ok(review);
    return { kind: "ALREADY_PROCESSING", review };
  }
}

function request(signal?: AbortSignal, userId = USER_ID) {
  return {
    reviewId: REVIEW_ID,
    userId,
    ...(signal === undefined ? {} : { signal }),
  };
}

async function holdProcessingLock(redisExecutor: ProcessingRedisExecutor): Promise<void> {
  const result = await acquireReviewLock(redisExecutor, processingRedisConfig(), {
    reviewId: REVIEW_ID,
    token: "held-by-another-processing-run",
  });
  assert.deepEqual(result, { acquired: true, token: "held-by-another-processing-run" });
}

async function completeReview(repository: InMemoryReviewRepository): Promise<void> {
  const processing = await repository.transitionForUser(USER_ID, REVIEW_ID, {
    fromStatuses: ["PENDING"],
    now: FIXED_NOW,
    toStatus: "PROCESSING",
  });
  assert.ok(processing);
  const execution = await new AiReviewService(
    new FakeAiReviewProvider([{ output: VALID_RESULT }]),
  ).review({
    language: "typescript",
    mode: "STANDARD",
    source: "const answer = 42;",
  });
  const completed = await repository.finalizeForUser(
    USER_ID,
    REVIEW_ID,
    execution,
    FIXED_NOW,
    processing.processingGeneration,
  );
  assert.ok(completed);
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
    const redisExecutor = new ProcessingRedisExecutor();
    const processing = createProcessing(repository, provider, redisExecutor);

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
    const acquisition = redisExecutor.setCalls[0];
    const release = redisExecutor.evalCalls[0];
    assert.ok(acquisition);
    assert.ok(release);
    assert.equal(acquisition.operation, "lock-acquisition");
    assert.equal(acquisition.key, "repomentor:lock:review:review-processing-1");
    assert.equal(acquisition.options.NX, true);
    assert.equal(acquisition.options.PX, 10_000);
    assert.notEqual(acquisition.value, REVIEW_ID);
    assert.notEqual(acquisition.value, USER_ID);
    assert.equal(release.operation, "lock-release");
    assert.deepEqual(release.options.arguments, [acquisition.value]);
    assert.equal(redisExecutor.hasHeldLock(), false);
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

  it("renews the owned lock on a monotonic lease cycle and cleans up timers", async () => {
    const repository = new RecordingReviewRepository();
    await createReview(repository);
    let markProviderStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    let resolveProvider!: (result: AiProviderResult) => void;
    const provider = new FakeAiReviewProvider([
      () => {
        markProviderStarted();
        return new Promise<AiProviderResult>((resolve) => {
          resolveProvider = resolve;
        });
      },
    ]);
    const redisExecutor = new ProcessingRedisExecutor();
    const timer = new FakeProcessingTimer();
    const processing = createProcessing(
      repository,
      provider,
      redisExecutor,
      processingRedisConfig({ lockTtlMs: 3_000 }),
      timer,
    );

    const run = processing.process(request());
    await providerStarted;
    assert.equal(timer.pendingCount(), 2);

    await timer.advance(999);
    assert.equal(redisExecutor.renewalCalls, 0);
    await timer.advance(1);
    assert.equal(redisExecutor.renewalCalls, 1);
    assert.equal(redisExecutor.maxConcurrentRenewals, 1);
    assert.equal(timer.pendingCount(), 2);

    await timer.advance(1_000);
    assert.equal(redisExecutor.renewalCalls, 2);
    assert.equal(redisExecutor.maxConcurrentRenewals, 1);
    assert.equal(timer.pendingCount(), 2);

    const providerSignal = provider.requests[0]?.signal;
    assert.ok(providerSignal);
    assert.equal(providerSignal.aborted, false);

    resolveProvider({ output: VALID_RESULT });
    const outcome = await run;

    assert.equal(outcome.kind, "COMPLETED");
    assert.equal(redisExecutor.hasHeldLock(), false);
    assert.equal(timer.pendingCount(), 0);
    assert.equal(redisExecutor.evalCalls.at(-1)?.operation, "lock-release");
  });

  it("cancels a claimed generation on renewal failure without retry or provider leakage", async () => {
    for (const failure of ["false", "error"] as const) {
      const repository = new RecordingReviewRepository();
      await createReview(repository);
      let markProviderStarted!: () => void;
      const providerStarted = new Promise<void>((resolve) => {
        markProviderStarted = resolve;
      });
      let providerSignal!: AbortSignal;
      const provider = new FakeAiReviewProvider([
        (providerRequest) => {
          providerSignal = providerRequest.signal as AbortSignal;
          markProviderStarted();
          return new Promise<AiProviderResult>(() => undefined);
        },
      ]);
      const redisExecutor = new ProcessingRedisExecutor();
      if (failure === "false") {
        redisExecutor.renewalResult = false;
      } else {
        redisExecutor.renewalError = new RedisUnavailableError("lock-renewal");
      }
      const timer = new FakeProcessingTimer();
      const processing = createProcessing(
        repository,
        provider,
        redisExecutor,
        processingRedisConfig({ lockTtlMs: 3_000 }),
        timer,
      );

      const run = processing.process(request());
      await providerStarted;
      await timer.advance(1_000);
      const outcome = await run;

      assert.equal(outcome.kind, "CANCELLED");
      if (outcome.kind !== "CANCELLED") {
        throw new Error("expected lock renewal cancellation");
      }
      assert.deepEqual(outcome.cancellation, {
        code: "CANCELLED",
        kind: "CANCELLATION",
        source: "LOCK_RENEWAL",
      });
      assert.equal(provider.requests.length, 1);
      assert.equal(providerSignal.aborted, true);
      assert.deepEqual(
        repository.transitions.map(({ transition }) => transition.toStatus),
        ["PROCESSING", "CANCELLED"],
      );
      assert.equal(repository.transitions.at(-1)?.transition.expectedProcessingGeneration, 1);
      assert.equal(
        repository.transitions.some(({ transition }) =>
          ["COMPLETED", "FAILED"].includes(transition.toStatus),
        ),
        false,
      );
      assert.equal(redisExecutor.renewalCalls, 1);
      assert.equal(redisExecutor.maxConcurrentRenewals, 1);
      assert.equal(redisExecutor.hasHeldLock(), false);
      assert.equal(timer.pendingCount(), 0);
    }
  });

  it("durably fences delayed successful finalization at the lease-loss boundary", async () => {
    const repository = new DelayedTerminalRepository();
    await createReview(repository);
    let markProviderStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    let resolveProvider!: (result: AiProviderResult) => void;
    const provider = new FakeAiReviewProvider([
      () => {
        markProviderStarted();
        return new Promise<AiProviderResult>((resolve) => {
          resolveProvider = resolve;
        });
      },
    ]);
    const redisExecutor = new ProcessingRedisExecutor();
    redisExecutor.renewalResult = false;
    const timer = new FakeProcessingTimer();
    const processing = createProcessing(
      repository,
      provider,
      redisExecutor,
      processingRedisConfig({ lockTtlMs: 3_000 }),
      timer,
    );

    const run = processing.process(request());
    await providerStarted;
    resolveProvider({ output: STALE_RESULT });
    await repository.terminalStarted;

    await timer.advance(1_000);
    const outcome = await run;

    assert.equal(outcome.kind, "CANCELLED");
    if (outcome.kind !== "CANCELLED") {
      throw new Error("expected lease-loss cancellation");
    }
    assert.equal(outcome.cancellation.source, "LOCK_RENEWAL");
    assert.equal((await repository.findByIdForUser(USER_ID, REVIEW_ID))?.status, "CANCELLED");
    assert.equal((await repository.findByIdForUser(USER_ID, REVIEW_ID))?.processingGeneration, 1);
    assert.equal(await repository.findResultForUser(USER_ID, REVIEW_ID), null);
    assert.equal(timer.pendingCount(), 0);

    repository.releaseTerminal();
    await repository.terminalSettled;
    assert.equal((await repository.findByIdForUser(USER_ID, REVIEW_ID))?.status, "CANCELLED");
    assert.equal(await repository.findResultForUser(USER_ID, REVIEW_ID), null);
  });

  it("durably fences delayed failure finalization at the lease-loss boundary", async () => {
    const repository = new DelayedTerminalRepository();
    await createReview(repository);
    const provider = new FakeAiReviewProvider([
      new AiProviderError("RATE_LIMITED", { retryable: true }),
    ]);
    const redisExecutor = new ProcessingRedisExecutor();
    redisExecutor.renewalResult = false;
    const timer = new FakeProcessingTimer();
    const processing = createProcessing(
      repository,
      provider,
      redisExecutor,
      processingRedisConfig({ lockTtlMs: 3_000 }),
      timer,
    );

    const run = processing.process(request());
    await repository.terminalStarted;

    await timer.advance(1_000);
    const outcome = await run;

    assert.equal(outcome.kind, "CANCELLED");
    if (outcome.kind !== "CANCELLED") {
      throw new Error("expected lease-loss cancellation");
    }
    assert.equal(outcome.cancellation.source, "LOCK_RENEWAL");
    assert.equal((await repository.findByIdForUser(USER_ID, REVIEW_ID))?.status, "CANCELLED");
    assert.equal((await repository.findByIdForUser(USER_ID, REVIEW_ID))?.processingGeneration, 1);
    assert.equal(await repository.findResultForUser(USER_ID, REVIEW_ID), null);
    assert.equal(timer.pendingCount(), 0);

    repository.releaseTerminal();
    await repository.terminalSettled;
    assert.equal((await repository.findByIdForUser(USER_ID, REVIEW_ID))?.status, "CANCELLED");
    assert.equal(await repository.findResultForUser(USER_ID, REVIEW_ID), null);
  });

  it("fails closed when the lease fence rejects during delayed successful finalization", async () => {
    const fenceError = new Error("lease fence unavailable");
    const repository = new FenceFailureDelayedTerminalRepository(fenceError);
    await createReview(repository);
    let markProviderStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    let resolveProvider!: (result: AiProviderResult) => void;
    const provider = new FakeAiReviewProvider([
      () => {
        markProviderStarted();
        return new Promise<AiProviderResult>((resolve) => {
          resolveProvider = resolve;
        });
      },
    ]);
    const redisExecutor = new ProcessingRedisExecutor();
    redisExecutor.renewalResult = false;
    const timer = new FakeProcessingTimer();
    const processing = createProcessing(
      repository,
      provider,
      redisExecutor,
      processingRedisConfig({ lockTtlMs: 3_000 }),
      timer,
    );

    const run = processing.process(request());
    await providerStarted;
    resolveProvider({ output: STALE_RESULT });
    await repository.terminalStarted;

    await timer.advance(1_000);
    await assert.rejects(run, (error: unknown) => error === fenceError);
    assert.equal((await repository.findByIdForUser(USER_ID, REVIEW_ID))?.status, "CANCELLED");
    assert.equal(await repository.findResultForUser(USER_ID, REVIEW_ID), null);
    assert.equal(timer.pendingCount(), 0);

    repository.releaseTerminal();
    await repository.terminalSettled;
    assert.equal((await repository.findByIdForUser(USER_ID, REVIEW_ID))?.status, "CANCELLED");
    assert.equal(await repository.findResultForUser(USER_ID, REVIEW_ID), null);
  });

  it("fails closed when the lease fence rejects during delayed failure finalization", async () => {
    const fenceError = new Error("lease fence unavailable");
    const repository = new FenceFailureDelayedTerminalRepository(fenceError);
    await createReview(repository);
    const provider = new FakeAiReviewProvider([
      new AiProviderError("RATE_LIMITED", { retryable: true }),
    ]);
    const redisExecutor = new ProcessingRedisExecutor();
    redisExecutor.renewalResult = false;
    const timer = new FakeProcessingTimer();
    const processing = createProcessing(
      repository,
      provider,
      redisExecutor,
      processingRedisConfig({ lockTtlMs: 3_000 }),
      timer,
    );

    const run = processing.process(request());
    await repository.terminalStarted;

    await timer.advance(1_000);
    await assert.rejects(run, (error: unknown) => error === fenceError);
    assert.equal((await repository.findByIdForUser(USER_ID, REVIEW_ID))?.status, "CANCELLED");
    assert.equal(await repository.findResultForUser(USER_ID, REVIEW_ID), null);
    assert.equal(timer.pendingCount(), 0);

    repository.releaseTerminal();
    await repository.terminalSettled;
    assert.equal((await repository.findByIdForUser(USER_ID, REVIEW_ID))?.status, "CANCELLED");
    assert.equal(await repository.findResultForUser(USER_ID, REVIEW_ID), null);
  });

  it("fails closed at the watchdog deadline without overlapping or retrying renewal", async () => {
    const repository = new RecordingReviewRepository();
    await createReview(repository);
    let markProviderStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    let providerSignal!: AbortSignal;
    const provider = new FakeAiReviewProvider([
      (providerRequest) => {
        providerSignal = providerRequest.signal as AbortSignal;
        markProviderStarted();
        return new Promise<AiProviderResult>(() => undefined);
      },
    ]);
    let resolveRenewal!: (result: unknown) => void;
    const redisExecutor = new ProcessingRedisExecutor();
    redisExecutor.renewalPending = new Promise<unknown>((resolve) => {
      resolveRenewal = resolve;
    });
    const timer = new FakeProcessingTimer();
    const processing = createProcessing(
      repository,
      provider,
      redisExecutor,
      processingRedisConfig({ lockTtlMs: 3_000 }),
      timer,
    );

    const run = processing.process(request());
    await providerStarted;
    await timer.advance(1_000);
    assert.equal(redisExecutor.renewalCalls, 1);
    assert.equal(redisExecutor.activeRenewals, 1);
    await timer.advance(1_000);
    const outcome = await run;

    assert.equal(outcome.kind, "CANCELLED");
    if (outcome.kind !== "CANCELLED") {
      throw new Error("expected watchdog cancellation");
    }
    assert.equal(outcome.cancellation.source, "LOCK_RENEWAL");
    assert.equal(provider.requests.length, 1);
    assert.equal(providerSignal.aborted, true);
    assert.equal(redisExecutor.renewalCalls, 1);
    assert.equal(redisExecutor.maxConcurrentRenewals, 1);
    assert.equal(redisExecutor.hasHeldLock(), false);
    assert.equal(timer.pendingCount(), 0);

    await timer.advance(5_000);
    assert.equal(redisExecutor.renewalCalls, 1);
    resolveRenewal(1);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(redisExecutor.activeRenewals, 0);
  });

  it("returns the generic lock-unavailable boundary before a generation is claimed", async () => {
    const repository = new RecordingReviewRepository();
    await createReview(repository);
    const provider = new FakeAiReviewProvider([{ output: VALID_RESULT }]);
    const redisExecutor = new ProcessingRedisExecutor();
    redisExecutor.renewalResult = false;
    const timer = new FakeProcessingTimer();
    const processing = new DelayedClaimProcessingService(
      repository,
      provider,
      redisExecutor,
      processingRedisConfig({ lockTtlMs: 3_000 }),
      timer,
    );

    const run = processing.process(request());
    await processing.claimStarted;
    await timer.advance(1_000);
    processing.releaseClaim();

    await assert.rejects(run, (error: unknown) => {
      assert.ok(error instanceof ReviewProcessingBoundaryError);
      assert.equal(error.code, "PROCESSING_LOCK_UNAVAILABLE");
      return true;
    });
    assert.equal(provider.requests.length, 0);
    assert.equal(repository.transitions.length, 0);
    assert.equal(redisExecutor.hasHeldLock(), false);
    assert.equal(timer.pendingCount(), 0);
  });

  it("keeps caller signal cancellation precedence when renewal fails", async () => {
    const repository = new RecordingReviewRepository();
    await createReview(repository);
    let markProviderStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    let providerSignal!: AbortSignal;
    const provider = new FakeAiReviewProvider([
      (providerRequest) => {
        providerSignal = providerRequest.signal as AbortSignal;
        markProviderStarted();
        return new Promise<AiProviderResult>(() => undefined);
      },
    ]);
    const controller = new AbortController();
    const redisExecutor = new ProcessingRedisExecutor();
    redisExecutor.renewalResult = false;
    redisExecutor.renewalHook = () => controller.abort();
    const timer = new FakeProcessingTimer();
    const processing = createProcessing(
      repository,
      provider,
      redisExecutor,
      processingRedisConfig({ lockTtlMs: 3_000 }),
      timer,
    );

    const run = processing.process(request(controller.signal));
    await providerStarted;
    await timer.advance(1_000);
    const outcome = await run;

    assert.equal(outcome.kind, "CANCELLED");
    if (outcome.kind !== "CANCELLED") {
      throw new Error("expected caller cancellation");
    }
    assert.equal(outcome.cancellation.source, "SIGNAL");
    assert.equal(providerSignal.aborted, true);
    assert.equal(redisExecutor.hasHeldLock(), false);
  });

  it("releases the process lock after provider failure and cancellation", async () => {
    for (const providerError of [
      new AiProviderError("RATE_LIMITED", { retryable: true }),
      new AiProviderError("CANCELLED"),
    ]) {
      const repository = new RecordingReviewRepository();
      await createReview(repository);
      const provider = new FakeAiReviewProvider([providerError]);
      const redisExecutor = new ProcessingRedisExecutor();

      const outcome = await createProcessing(repository, provider, redisExecutor).process(
        request(),
      );

      assert.ok(outcome.kind === "FAILED" || outcome.kind === "CANCELLED");
      assert.equal(provider.requests.length, 1);
      assert.equal(redisExecutor.setCalls.length, 1);
      assert.equal(redisExecutor.evalCalls.length, 1);
      assert.equal(redisExecutor.hasHeldLock(), false);
    }
  });

  it("keeps provider outcome when release is unavailable and relies on the bounded TTL", async () => {
    const repository = new RecordingReviewRepository();
    await createReview(repository);
    const provider = new FakeAiReviewProvider([{ output: VALID_RESULT }]);
    const redisExecutor = new ProcessingRedisExecutor();
    redisExecutor.releaseError = new RedisUnavailableError("lock-release");

    const outcome = await createProcessing(repository, provider, redisExecutor).process(request());

    assert.equal(outcome.kind, "COMPLETED");
    assert.equal(provider.requests.length, 1);
    assert.equal(redisExecutor.evalCalls.length, 1);
    assert.equal(redisExecutor.hasHeldLock(), true);
  });

  it("rechecks an owned PROCESSING review on lock contention", async () => {
    const repository = new RecordingReviewRepository();
    await createReview(repository);
    const transitioned = await repository.transitionForUser(USER_ID, REVIEW_ID, {
      fromStatuses: ["PENDING"],
      now: FIXED_NOW,
      toStatus: "PROCESSING",
    });
    assert.ok(transitioned);
    const provider = new FakeAiReviewProvider([{ output: VALID_RESULT }]);
    const redisExecutor = new ProcessingRedisExecutor();
    await holdProcessingLock(redisExecutor);

    const outcome = await createProcessing(repository, provider, redisExecutor).process(request());

    assert.deepEqual(outcome, {
      kind: "SKIPPED",
      reason: "ALREADY_PROCESSING",
      review: await repository.findByIdForUser(USER_ID, REVIEW_ID),
      status: "PROCESSING",
    });
    assert.equal(provider.requests.length, 0);
    assert.equal(redisExecutor.evalCalls.length, 0);
  });

  it("rechecks an owned COMPLETED review on lock contention", async () => {
    const repository = new RecordingReviewRepository();
    await createReview(repository);
    await completeReview(repository);
    const provider = new FakeAiReviewProvider([{ output: VALID_RESULT }]);
    const redisExecutor = new ProcessingRedisExecutor();
    await holdProcessingLock(redisExecutor);

    const outcome = await createProcessing(repository, provider, redisExecutor).process(request());

    assert.deepEqual(outcome, {
      kind: "SKIPPED",
      reason: "ALREADY_COMPLETED",
      review: await repository.findByIdForUser(USER_ID, REVIEW_ID),
      status: "COMPLETED",
    });
    assert.equal(provider.requests.length, 0);
    assert.equal(redisExecutor.evalCalls.length, 0);
  });

  it("maps unresolved PENDING lock contention to the existing claim conflict", async () => {
    const repository = new RecordingReviewRepository();
    await createReview(repository);
    const provider = new FakeAiReviewProvider([{ output: VALID_RESULT }]);
    const redisExecutor = new ProcessingRedisExecutor();
    await holdProcessingLock(redisExecutor);

    await assert.rejects(
      createProcessing(repository, provider, redisExecutor).process(request()),
      (error: unknown) => {
        assert.ok(error instanceof ReviewProcessingBoundaryError);
        assert.equal(error.code, "CLAIM_CONFLICT");
        return true;
      },
    );
    assert.equal(provider.requests.length, 0);
    assert.equal((await repository.findByIdForUser(USER_ID, REVIEW_ID))?.status, "PENDING");
    assert.equal(redisExecutor.evalCalls.length, 0);
  });

  it("fails closed on lock acquisition unavailability or command failure", async () => {
    for (const acquisitionError of [
      new RedisUnavailableError("lock-acquisition"),
      new RedisCommandError("lock-acquisition"),
    ]) {
      const repository = new RecordingReviewRepository();
      await createReview(repository);
      const provider = new FakeAiReviewProvider([{ output: VALID_RESULT }]);
      const redisExecutor = new ProcessingRedisExecutor();
      redisExecutor.acquisitionError = acquisitionError;

      await assert.rejects(
        createProcessing(repository, provider, redisExecutor).process(request()),
        (error: unknown) => {
          assert.ok(error instanceof ReviewProcessingBoundaryError);
          assert.equal(error.code, "PROCESSING_LOCK_UNAVAILABLE");
          return true;
        },
      );
      assert.equal(provider.requests.length, 0);
      assert.equal(repository.transitions.length, 0);
      assert.equal((await repository.findByIdForUser(USER_ID, REVIEW_ID))?.status, "PENDING");
      assert.equal(redisExecutor.evalCalls.length, 0);
    }
  });

  it("checks ownership before attempting lock acquisition", async () => {
    const repository = new RecordingReviewRepository();
    await createReview(repository);
    const provider = new FakeAiReviewProvider([{ output: VALID_RESULT }]);
    const redisExecutor = new ProcessingRedisExecutor();

    await assert.rejects(
      createProcessing(repository, provider, redisExecutor).process(
        request(undefined, OTHER_USER_ID),
      ),
      (error: unknown) => {
        assert.ok(error instanceof ReviewProcessingBoundaryError);
        assert.equal(error.code, "REVIEW_NOT_FOUND");
        return true;
      },
    );
    assert.equal(redisExecutor.setCalls.length, 0);
    assert.equal(redisExecutor.evalCalls.length, 0);
    assert.equal(provider.requests.length, 0);
    assert.equal(repository.transitions.length, 0);
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

  it("fences stale completion after cancel, retry, and a new processing claim", async () => {
    const repository = new RecordingReviewRepository();
    await createReview(repository);
    let resolveA!: (result: AiProviderResult) => void;
    let markAStarted!: () => void;
    const aStarted = new Promise<void>((resolve) => {
      markAStarted = resolve;
    });
    const providerA = new FakeAiReviewProvider([
      async () => {
        markAStarted();
        return new Promise<AiProviderResult>((resolve) => {
          resolveA = resolve;
        });
      },
    ]);
    let resolveB!: (result: AiProviderResult) => void;
    let markBStarted!: () => void;
    const bStarted = new Promise<void>((resolve) => {
      markBStarted = resolve;
    });
    const providerB = new FakeAiReviewProvider([
      async () => {
        markBStarted();
        return new Promise<AiProviderResult>((resolve) => {
          resolveB = resolve;
        });
      },
    ]);
    const processingA = createProcessing(repository, providerA);
    const processingB = createProcessing(repository, providerB);
    const reviewService = new ReviewService(repository);
    const runA = processingA.process(request());
    await aStarted;

    await reviewService.cancel(USER_ID, REVIEW_ID, FIXED_NOW);
    await reviewService.retry(USER_ID, REVIEW_ID, FIXED_NOW);
    const runB = processingB.process(request());
    await bStarted;

    const claimedB = await repository.findByIdForUser(USER_ID, REVIEW_ID);
    assert.equal(claimedB?.status, "PROCESSING");
    assert.equal(claimedB?.processingGeneration, 2);

    resolveA({ output: STALE_RESULT });
    const staleOutcome = await runA;
    assert.deepEqual(staleOutcome, {
      kind: "SKIPPED",
      reason: "STALE_CLAIM",
      review: claimedB,
      status: "PROCESSING",
    });
    assert.equal(await repository.findResultForUser(USER_ID, REVIEW_ID), null);
    assert.equal((await repository.findByIdForUser(USER_ID, REVIEW_ID))?.processingGeneration, 2);

    resolveB({ output: LIVE_RESULT, usage: { inputTokens: 4, outputTokens: 3, totalTokens: 7 } });
    const liveOutcome = await runB;
    assert.equal(liveOutcome.kind, "COMPLETED");
    assert.equal(
      (await repository.findResultForUser(USER_ID, REVIEW_ID))?.result.summary,
      LIVE_RESULT.summary,
    );
  });

  it("fences stale failure and cancellation finalization for a retried claim", async () => {
    for (const terminalError of [
      new AiProviderError("RATE_LIMITED", { retryable: true }),
      new AiProviderError("CANCELLED"),
    ]) {
      const repository = new RecordingReviewRepository();
      await createReview(repository);
      let rejectA!: (error: unknown) => void;
      let markAStarted!: () => void;
      const aStarted = new Promise<void>((resolve) => {
        markAStarted = resolve;
      });
      const providerA = new FakeAiReviewProvider([
        async () => {
          markAStarted();
          return new Promise<AiProviderResult>((_resolve, reject) => {
            rejectA = reject;
          });
        },
      ]);
      const runA = createProcessing(repository, providerA).process(request());
      await aStarted;

      const reviewService = new ReviewService(repository);
      await reviewService.cancel(USER_ID, REVIEW_ID, FIXED_NOW);
      await reviewService.retry(USER_ID, REVIEW_ID, FIXED_NOW);
      const claimB = await createProcessing(
        repository,
        new FakeAiReviewProvider([{ output: LIVE_RESULT }]),
      ).claim(request());
      assert.equal(claimB.kind, "CLAIMED");
      if (claimB.kind !== "CLAIMED") {
        throw new Error("expected the retried processing claim to succeed");
      }
      assert.equal(claimB.generation, 2);

      rejectA(terminalError);
      const staleOutcome = await runA;
      assert.equal(staleOutcome.kind, "SKIPPED");
      assert.equal(staleOutcome.reason, "STALE_CLAIM");
      assert.equal(staleOutcome.status, "PROCESSING");
      assert.equal((await repository.findByIdForUser(USER_ID, REVIEW_ID))?.processingGeneration, 2);
      assert.equal(await repository.findResultForUser(USER_ID, REVIEW_ID), null);
    }
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
      new ProcessingRedisExecutor(),
      processingRedisConfig(),
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
