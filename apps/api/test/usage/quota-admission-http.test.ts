import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RedisUnavailableError } from "../../src/modules/redis/redis.errors.js";
import type { RedisCommandExecutor } from "../../src/modules/redis/redis.types.js";
import { InMemoryQuotaAdmissionRepository } from "../../src/modules/usage/in-memory-quota-admission.repository.js";
import {
  QuotaAdmissionConflictError,
  QuotaAdmissionInputError,
} from "../../src/modules/usage/quota-admission.errors.js";
import {
  computeQuotaAdmissionFingerprint,
  QUOTA_ADMISSION_FINGERPRINT_VERSION,
} from "../../src/modules/usage/quota-admission.fingerprint.js";
import {
  QuotaAdmissionFinalizerConflictError,
  QuotaAdmissionRateLimitError,
  QuotaAdmissionUnavailableError,
} from "../../src/modules/usage/quota-admission-http.errors.js";
import {
  QuotaAdmissionHttpService,
  type AuthenticatedQuotaAdmissionInput,
} from "../../src/modules/usage/quota-admission-http.service.js";
import { QuotaAdmissionService } from "../../src/modules/usage/quota-admission.service.js";
import type {
  CreateQuotaAdmissionRecordInput,
  QuotaAdmissionCreateOrGetResult,
  QuotaAdmissionRecord,
  QuotaAdmissionRepository,
  QuotaAdmissionStatus,
} from "../../src/modules/usage/quota-admission.types.js";
import {
  ReviewFinalizerConflictError,
  ReviewFinalizerUnavailableError,
} from "../../src/modules/usage/review-finalizer.errors.js";
import type {
  FinalizeReviewInput,
  ReviewFinalizer,
  ReviewFinalizerResult,
  ReviewFinalizerSummary,
} from "../../src/modules/usage/review-finalizer.types.js";
import {
  USAGE_DEFAULT_REDIS_CONFIG,
  type UsageRedisConfig,
} from "../../src/modules/usage/usage.config.js";

const SECRET = "quota-admission-test-secret-which-is-at-least-32-bytes";
const USER_ID = "user_primary";
const OTHER_USER_ID = "user_other";
const IDEMPOTENCY_KEY = "quota-admission-key-123456";
const SOURCE = "const answer = 42;\n";
const NOW = new Date("2026-08-07T08:00:00.000Z");

function redisConfig(): UsageRedisConfig {
  return {
    authenticatedDailyLimits: { DEEP: 3, QUICK: 20, STANDARD: 10 },
    ...USAGE_DEFAULT_REDIS_CONFIG,
  };
}

class RecordingRepository implements QuotaAdmissionRepository {
  readonly inner = new InMemoryQuotaAdmissionRepository();
  readonly creates: CreateQuotaAdmissionRecordInput[] = [];

  async createOrGet(
    input: CreateQuotaAdmissionRecordInput,
  ): Promise<QuotaAdmissionCreateOrGetResult> {
    this.creates.push(input);
    return this.inner.createOrGet(input);
  }

  findForOwner(userId: string, admissionId: string): Promise<QuotaAdmissionRecord | null> {
    return this.inner.findForOwner(userId, admissionId);
  }

  transitionForOwner(
    userId: string,
    admissionId: string,
    toStatus: QuotaAdmissionStatus,
    now: Date,
  ): Promise<QuotaAdmissionRecord> {
    return this.inner.transitionForOwner(userId, admissionId, toStatus, now);
  }
}

class FakeRedisExecutor implements RedisCommandExecutor {
  calls = 0;
  outcome: "RESERVED" | "DENIED" = "RESERVED";
  retryAfterSeconds = 42;
  unavailable = false;

  async eval(): Promise<unknown> {
    this.calls += 1;
    if (this.unavailable) {
      throw new RedisUnavailableError("quota-admission-reservation");
    }

    if (this.outcome === "DENIED") {
      return [0, 10, 0, this.retryAfterSeconds, 0];
    }

    return [1, 1, 9, this.retryAfterSeconds, 0];
  }

  async set(): Promise<"OK"> {
    return "OK";
  }
}

class RecordingFinalizer implements ReviewFinalizer {
  readonly inputs: FinalizeReviewInput[] = [];
  private readonly finalized = new Set<string>();
  error: Error | undefined;

  async finalize(input: FinalizeReviewInput): Promise<ReviewFinalizerResult> {
    this.inputs.push(input);
    if (this.error) {
      throw this.error;
    }

    if (this.finalized.has(input.admissionId)) {
      return { kind: "REPLAYED", summary: summary(input) };
    }

    this.finalized.add(input.admissionId);
    return { kind: "FINALIZED", summary: summary(input) };
  }
}

class TransitionRaceAdmissionService extends QuotaAdmissionService {
  private raceOnce = true;

  override async transitionForOwner(
    userId: string,
    admissionId: string,
    toStatus: QuotaAdmissionStatus,
    now: Date,
  ): Promise<QuotaAdmissionRecord> {
    const updated = await super.transitionForOwner(userId, admissionId, toStatus, now);

    if (toStatus === "RESERVED" && this.raceOnce) {
      this.raceOnce = false;
      throw new Error("simulated post-commit uncertainty");
    }

    return updated;
  }
}

function summary(input: FinalizeReviewInput): ReviewFinalizerSummary {
  return {
    createdAt: new Date(input.now),
    id: input.reviewId,
    language: input.language,
    mode: input.mode,
    status: "PENDING",
    updatedAt: new Date(input.now),
  };
}

function input(
  overrides: Partial<AuthenticatedQuotaAdmissionInput> = {},
): AuthenticatedQuotaAdmissionInput {
  return {
    idempotencyKey: IDEMPOTENCY_KEY,
    language: "  TypeScript  ",
    mode: undefined,
    now: NOW,
    source: SOURCE,
    userId: USER_ID,
    ...overrides,
  };
}

function createFixture() {
  const repository = new RecordingRepository();
  const admission = new QuotaAdmissionService(repository);
  const redis = new FakeRedisExecutor();
  const finalizer = new RecordingFinalizer();
  const service = new QuotaAdmissionHttpService(
    admission,
    redis,
    redisConfig(),
    { fingerprintSecret: SECRET },
    finalizer,
  );

  return { admission, finalizer, redis, repository, service };
}

describe("authenticated quota admission HTTP orchestration", () => {
  it("canonicalizes once, sends immutable review/fingerprint metadata, and replays without Redis", async () => {
    const fixture = createFixture();

    const created = await fixture.service.admit(input());
    assert.equal(
      (await fixture.repository.findForOwner(USER_ID, fixture.repository.creates[0]!.id))?.status,
      "RESERVED",
    );
    const replayed = await fixture.service.admit(input());

    assert.equal(created.kind, "CREATED");
    assert.equal(created.created, true);
    assert.equal(replayed.kind, "REPLAYED");
    assert.equal(replayed.created, false);
    assert.equal(
      fixture.finalizer.inputs[0]?.admissionId,
      fixture.finalizer.inputs[1]?.admissionId,
    );
    assert.equal(fixture.finalizer.inputs[0]?.reviewId, fixture.finalizer.inputs[1]?.reviewId);
    assert.equal(fixture.redis.calls, 1);
    assert.equal(fixture.finalizer.inputs.length, 2);
    assert.equal(fixture.finalizer.inputs[0]?.source, SOURCE);
    assert.equal(fixture.finalizer.inputs[0]?.language, "typescript");
    assert.equal(fixture.finalizer.inputs[0]?.mode, "STANDARD");
    assert.equal(fixture.finalizer.inputs[0]?.reviewId, fixture.finalizer.inputs[1]?.reviewId);
    assert.equal(
      fixture.finalizer.inputs[0]?.fingerprintVersion,
      QUOTA_ADMISSION_FINGERPRINT_VERSION,
    );
    assert.match(fixture.finalizer.inputs[0]?.requestFingerprintHash ?? "", /^[a-f0-9]{64}$/u);
  });

  it("keeps idempotency owner-scoped", async () => {
    const fixture = createFixture();

    await fixture.service.admit(input());
    await fixture.service.admit(input({ userId: OTHER_USER_ID }));

    assert.notEqual(
      fixture.finalizer.inputs[0]?.admissionId,
      fixture.finalizer.inputs[1]?.admissionId,
    );
    assert.notEqual(fixture.finalizer.inputs[0]?.reviewId, fixture.finalizer.inputs[1]?.reviewId);
    assert.equal(fixture.redis.calls, 2);
    assert.deepEqual(
      fixture.finalizer.inputs.map(({ userId }) => userId),
      [USER_ID, OTHER_USER_ID],
    );
  });

  it("rejects fingerprint conflict before Redis", async () => {
    const fixture = createFixture();
    await fixture.service.admit(input());

    await assert.rejects(
      fixture.service.admit(input({ source: "const answer = 43;\n" })),
      (error: unknown) => error instanceof QuotaAdmissionConflictError,
    );
    assert.equal(fixture.redis.calls, 1);
  });

  it("maps confirmed quota denial to a bounded retryable domain error", async () => {
    const fixture = createFixture();
    fixture.redis.outcome = "DENIED";
    fixture.redis.retryAfterSeconds = 42;

    await assert.rejects(fixture.service.admit(input()), (error: unknown) => {
      assert.ok(error instanceof QuotaAdmissionRateLimitError);
      assert.equal(error.retryAfterSeconds, 42);
      assert.equal(error.code, "QUOTA_ADMISSION_RATE_LIMITED");
      return true;
    });
    assert.equal(
      (await fixture.repository.findForOwner(USER_ID, fixture.repository.creates[0]!.id))?.status,
      "DENIED",
    );
  });

  it("marks Redis uncertainty indeterminate and never compensates", async () => {
    const fixture = createFixture();
    fixture.redis.unavailable = true;

    await assert.rejects(fixture.service.admit(input()), (error: unknown) => {
      assert.ok(error instanceof QuotaAdmissionUnavailableError);
      assert.equal(error.code, "QUOTA_ADMISSION_UNAVAILABLE");
      assert.doesNotMatch(error.message, /source|secret|quota-admission-key/u);
      return true;
    });

    const admissionId = fixture.repository.creates[0]!.id;
    assert.equal(
      (await fixture.repository.findForOwner(USER_ID, admissionId))?.status,
      "INDETERMINATE",
    );
    assert.equal(fixture.redis.calls, 1);
  });

  it("retries an existing RESERVED admission without Redis", async () => {
    const fixture = createFixture();
    const fingerprint = computeQuotaAdmissionFingerprint(SECRET, {
      fingerprintVersion: QUOTA_ADMISSION_FINGERPRINT_VERSION,
      language: "typescript",
      mode: "STANDARD",
      source: SOURCE,
    });
    const intent = await fixture.admission.createIntent({
      fingerprintVersion: fingerprint.fingerprintVersion,
      idempotencyKey: IDEMPOTENCY_KEY,
      mode: "STANDARD",
      now: NOW,
      requestFingerprintHash: fingerprint.requestFingerprintHash,
      userId: USER_ID,
    });
    await fixture.admission.transitionForOwner(USER_ID, intent.record.id, "RESERVED", NOW);

    const result = await fixture.service.admit(input());

    assert.equal(result.kind, "CREATED");
    assert.equal(fixture.redis.calls, 0);
    assert.equal(fixture.finalizer.inputs.length, 1);
  });

  it("rereads a concurrently persisted RESERVED transition instead of returning 503", async () => {
    const repository = new RecordingRepository();
    const admission = new TransitionRaceAdmissionService(repository);
    const redis = new FakeRedisExecutor();
    const finalizer = new RecordingFinalizer();
    const service = new QuotaAdmissionHttpService(
      admission,
      redis,
      redisConfig(),
      { fingerprintSecret: SECRET },
      finalizer,
    );

    const result = await service.admit(input());

    assert.equal(result.kind, "CREATED");
    assert.equal(redis.calls, 1);
    assert.equal(
      (await repository.findForOwner(USER_ID, repository.creates[0]!.id))?.status,
      "RESERVED",
    );
  });

  it("maps finalizer conflicts and marks unknown finalizer outcomes for reconciliation", async () => {
    const fixture = createFixture();
    fixture.finalizer.error = new ReviewFinalizerConflictError();

    await assert.rejects(
      fixture.service.admit(input()),
      (error: unknown) => error instanceof QuotaAdmissionFinalizerConflictError,
    );

    const unavailableFixture = createFixture();
    unavailableFixture.finalizer.error = new ReviewFinalizerUnavailableError();
    await assert.rejects(
      unavailableFixture.service.admit(input()),
      (error: unknown) => error instanceof QuotaAdmissionUnavailableError,
    );
    const admissionId = unavailableFixture.repository.creates[0]!.id;
    assert.equal(
      (await unavailableFixture.repository.findForOwner(USER_ID, admissionId))?.status,
      "RECONCILE_REQUIRED",
    );
  });

  it("redacts invalid idempotency material", async () => {
    const fixture = createFixture();
    const rawKey = "raw-secret-key-that-must-not-escape!";

    await assert.rejects(
      fixture.service.admit(input({ idempotencyKey: rawKey })),
      (error: unknown) => {
        assert.ok(error instanceof QuotaAdmissionInputError);
        assert.doesNotMatch(error.message, new RegExp(rawKey, "u"));
        return true;
      },
    );
    assert.equal(fixture.redis.calls, 0);
  });
});
