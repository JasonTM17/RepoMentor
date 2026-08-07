import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AiProviderError } from "../src/modules/ai/ai.errors.js";
import { AI_REVIEW_PROVIDER } from "../src/modules/ai/ai.types.js";
import { FakeAiReviewProvider } from "../src/modules/ai/fake-ai.provider.js";
import type { AiReviewExecution } from "../src/modules/ai/ai.types.js";
import type { ReviewResult } from "../src/modules/ai/review-result.schema.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.js";
import { AuthRateLimiter } from "../src/modules/auth/auth-rate-limiter.js";
import { AuthTokenService } from "../src/modules/auth/auth-token.service.js";
import { AUTH_REPOSITORY } from "../src/modules/auth/auth.types.js";
import { InMemoryAuthRepository } from "../src/modules/auth/in-memory-auth.repository.js";
import { type RedisCommandExecutor } from "../src/modules/redis/redis.types.js";
import { InMemoryReviewRepository } from "../src/modules/review/in-memory-review.repository.js";
import { REVIEW_REPOSITORY } from "../src/modules/review/review.types.js";
import {
  QUOTA_ADMISSION_FINGERPRINT_CONFIG,
  type QuotaAdmissionFingerprintConfig,
} from "../src/modules/usage/quota-admission.config.js";
import { InMemoryQuotaAdmissionRepository } from "../src/modules/usage/in-memory-quota-admission.repository.js";
import { QUOTA_ADMISSION_REDIS_EXECUTOR } from "../src/modules/usage/quota-admission-http.service.js";
import { QUOTA_ADMISSION_REPOSITORY } from "../src/modules/usage/quota-admission.types.js";
import {
  ReviewFinalizerConflictError,
  ReviewFinalizerIndeterminateError,
  ReviewFinalizerNotFoundError,
} from "../src/modules/usage/review-finalizer.errors.js";
import {
  assertReviewFinalizerAdmissionFingerprint,
  assertReviewFinalizerFingerprintMetadata,
  REVIEW_FINALIZER,
  type FinalizeReviewInput,
  type ReviewFinalizer,
  type ReviewFinalizerResult,
  type ReviewFinalizerSummary,
} from "../src/modules/usage/review-finalizer.types.js";
import {
  USAGE_DEFAULT_REDIS_CONFIG,
  USAGE_REDIS_CONFIG,
  type UsageRedisConfig,
} from "../src/modules/usage/usage.config.js";

const tokenConfig = {
  accessSecret: "access-secret-for-review-controller-tests-32-bytes",
  accessTtlSeconds: 900,
  cookieSameSite: "lax" as const,
  cookieSecure: true,
  refreshSecret: "refresh-secret-for-review-controller-tests-32-bytes",
  refreshTtlSeconds: 7_200,
};

const validUsage = { inputTokens: 12, outputTokens: 8, totalTokens: 20 } as const;

const validExecution: AiReviewExecution<ReviewResult> = {
  attempts: 1,
  durationMs: 0,
  model: "gpt-5.6-luna",
  provider: "luna",
  reasoningEffort: "medium",
  result: {
    findings: [],
    schemaVersion: "v1",
    summary: "No actionable findings were detected.",
  },
  usage: validUsage,
};

// Test-only fixture; this is not a user or provider API key.
const TEST_QUOTA_ADMISSION_FINGERPRINT_SECRET =
  "test-only-review-quota-admission-fingerprint-fixture-32-bytes";

function testRedisConfig(): UsageRedisConfig {
  return {
    authenticatedDailyLimits: { DEEP: 3, QUICK: 20, STANDARD: 10 },
    ...USAGE_DEFAULT_REDIS_CONFIG,
  };
}

class DeterministicQuotaAdmissionRedisExecutor implements RedisCommandExecutor {
  calls = 0;

  async eval(
    _script: string,
    options: { readonly arguments: readonly string[] },
  ): Promise<unknown> {
    this.calls += 1;
    const limit = Number(options.arguments[0]);
    assert.ok(Number.isSafeInteger(limit) && limit > 0);
    return [1, 1, limit - 1, 1, 0];
  }

  async set(): Promise<"OK"> {
    return "OK";
  }
}

class ReviewApiFinalizerFake implements ReviewFinalizer {
  private readonly finalizedAdmissions = new Set<string>();

  constructor(
    private readonly admissionRepository: InMemoryQuotaAdmissionRepository,
    private readonly reviewRepository: InMemoryReviewRepository,
  ) {}

  async finalize(input: FinalizeReviewInput): Promise<ReviewFinalizerResult> {
    const fingerprint = assertReviewFinalizerFingerprintMetadata(input);
    const admission = await this.admissionRepository.findForOwner(input.userId, input.admissionId);

    if (!admission) {
      throw new ReviewFinalizerNotFoundError();
    }

    if (admission.reviewId !== input.reviewId || admission.mode !== input.mode) {
      throw new ReviewFinalizerConflictError();
    }

    assertReviewFinalizerAdmissionFingerprint(
      {
        fingerprintVersion: admission.fingerprintVersion ?? null,
        requestFingerprintHash: admission.requestFingerprintHash ?? null,
      },
      fingerprint,
    );

    if (this.finalizedAdmissions.has(input.admissionId)) {
      const existing = await this.reviewRepository.findByIdForUser(input.userId, input.reviewId);

      if (!existing) {
        throw new ReviewFinalizerIndeterminateError();
      }

      return { kind: "REPLAYED", summary: reviewSummary(existing) };
    }

    if (admission.status !== "RESERVED") {
      throw new ReviewFinalizerConflictError();
    }

    const existing = await this.reviewRepository.findByIdForUser(input.userId, input.reviewId);

    if (existing) {
      throw new ReviewFinalizerConflictError();
    }

    const review = await this.reviewRepository.create({
      id: input.reviewId,
      language: input.language,
      mode: input.mode,
      source: input.source,
      userId: input.userId,
    });
    this.finalizedAdmissions.add(input.admissionId);

    return { kind: "FINALIZED", summary: reviewSummary(review) };
  }
}

function reviewSummary(review: {
  readonly id: string;
  readonly language: string;
  readonly mode: FinalizeReviewInput["mode"];
  readonly status: ReviewFinalizerSummary["status"];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): ReviewFinalizerSummary {
  return {
    createdAt: new Date(review.createdAt),
    id: review.id,
    language: review.language,
    mode: review.mode,
    status: review.status,
    updatedAt: new Date(review.updatedAt),
  };
}

interface ReviewUser {
  readonly accessToken: string;
  readonly id: string;
}

function parseSse(text: string): Array<{
  readonly data: Record<string, unknown>;
  readonly event: string;
  readonly id: string;
}> {
  return text
    .trim()
    .split("\n\n")
    .map((frame) => {
      const lines = frame.split("\n");
      const id = lines.find((line) => line.startsWith("id: "))?.slice(4);
      const event = lines.find((line) => line.startsWith("event: "))?.slice(7);
      const data = lines.find((line) => line.startsWith("data: "))?.slice(6);

      assert.ok(id);
      assert.ok(event);
      assert.ok(data);
      return { data: JSON.parse(data) as Record<string, unknown>, event, id };
    });
}

describe("review API", () => {
  let app: INestApplication;
  let authRepository: InMemoryAuthRepository;
  let reviewRepository: InMemoryReviewRepository;
  let provider: FakeAiReviewProvider;
  let providerFailure: Error | undefined;
  let rateLimiter: AuthRateLimiter;
  let quotaAdmissionRepository: InMemoryQuotaAdmissionRepository;
  let redisExecutor: DeterministicQuotaAdmissionRedisExecutor;
  let userSequence = 0;
  let idempotencySequence = 0;

  before(async () => {
    authRepository = new InMemoryAuthRepository();
    reviewRepository = new InMemoryReviewRepository();
    quotaAdmissionRepository = new InMemoryQuotaAdmissionRepository();
    redisExecutor = new DeterministicQuotaAdmissionRedisExecutor();
    const fingerprintConfig: QuotaAdmissionFingerprintConfig = {
      fingerprintSecret: TEST_QUOTA_ADMISSION_FINGERPRINT_SECRET,
    };
    const finalizer = new ReviewApiFinalizerFake(quotaAdmissionRepository, reviewRepository);
    provider = new FakeAiReviewProvider([
      () => {
        if (providerFailure) {
          throw providerFailure;
        }

        return {
          output: validExecution.result,
          usage: validUsage,
        };
      },
    ]);
    const tokenService = new AuthTokenService(tokenConfig);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AUTH_REPOSITORY)
      .useValue(authRepository)
      .overrideProvider(AuthTokenService)
      .useValue(tokenService)
      .overrideProvider(AI_REVIEW_PROVIDER)
      .useValue(provider)
      .overrideProvider(REVIEW_REPOSITORY)
      .useValue(reviewRepository)
      .overrideProvider(QUOTA_ADMISSION_FINGERPRINT_CONFIG)
      .useValue(fingerprintConfig)
      .overrideProvider(QUOTA_ADMISSION_REPOSITORY)
      .useValue(quotaAdmissionRepository)
      .overrideProvider(QUOTA_ADMISSION_REDIS_EXECUTOR)
      .useValue(redisExecutor)
      .overrideProvider(REVIEW_FINALIZER)
      .useValue(finalizer)
      .overrideProvider(USAGE_REDIS_CONFIG)
      .useValue(testRedisConfig())
      .compile();

    app = configureApp(moduleRef.createNestApplication());
    rateLimiter = moduleRef.get(AuthRateLimiter);
    await app.init();
  });

  after(async () => {
    await app.close();
  });

  beforeEach(() => {
    rateLimiter.clear();
    providerFailure = undefined;
    provider.requests.length = 0;
    redisExecutor.calls = 0;
  });

  async function createUser(): Promise<ReviewUser> {
    userSequence += 1;
    const email = `review-user-${userSequence}@example.com`;
    const password = "correct horse battery staple";
    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ displayName: `Review User ${userSequence}`, email, password });
    assert.equal(registered.status, 202);

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    assert.equal(login.status, 201);

    return {
      accessToken: login.body.data.accessToken as string,
      id: login.body.data.user.id as string,
    };
  }

  function nextIdempotencyKey(): string {
    idempotencySequence += 1;
    return `review-idempotency-key-${idempotencySequence}`;
  }

  function postReview(user: ReviewUser, source: string, idempotencyKey = nextIdempotencyKey()) {
    return request(app.getHttpServer())
      .post("/api/v1/reviews")
      .set("authorization", `Bearer ${user.accessToken}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ language: "TypeScript", source });
  }

  async function createReview(
    user: ReviewUser,
    source = "const answer = 42;",
    idempotencyKey = nextIdempotencyKey(),
  ) {
    const response = await postReview(user, source, idempotencyKey);
    assert.equal(response.status, 201);
    return response.body.data as { id: string; status: string };
  }

  it("requires Idempotency-Key for authenticated review admission", async () => {
    const user = await createUser();
    const source = "const missingAdmissionKey = true;";
    const response = await request(app.getHttpServer())
      .post("/api/v1/reviews")
      .set("authorization", `Bearer ${user.accessToken}`)
      .send({ language: "TypeScript", source });

    assert.equal(response.status, 400);
    assert.equal("data" in response.body, false);
    assert.equal(JSON.stringify(response.body).includes(source), false);
  });

  it("rejects null mode before Redis or review mutation", async () => {
    const user = await createUser();
    const source = "const nullModeSource = true;";
    const idempotencyKey = nextIdempotencyKey();
    const response = await request(app.getHttpServer())
      .post("/api/v1/reviews")
      .set("authorization", `Bearer ${user.accessToken}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ language: "TypeScript", mode: null, source });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_FAILED");
    assert.equal(JSON.stringify(response.body).includes(source), false);
    assert.equal(JSON.stringify(response.body).includes(idempotencyKey), false);
    assert.equal(redisExecutor.calls, 0);

    const stored = await reviewRepository.listForUser({ limit: 20, page: 1, userId: user.id });
    assert.equal(stored.total, 0);
  });

  it("replays identical authenticated admission without a second review or Redis reservation", async () => {
    const user = await createUser();
    const source = "const replayedAdmission = true;";
    const idempotencyKey = nextIdempotencyKey();
    const created = await createReview(user, source, idempotencyKey);
    const replayed = await postReview(user, source, idempotencyKey);

    assert.equal(replayed.status, 200);
    assert.equal(replayed.body.data.id, created.id);
    assert.equal(replayed.body.data.status, "PENDING");
    assert.equal("source" in replayed.body.data, false);
    assert.equal(JSON.stringify(replayed.body).includes(source), false);
    assert.equal(JSON.stringify(replayed.body).includes(idempotencyKey), false);
    assert.equal(redisExecutor.calls, 1);

    const stored = await reviewRepository.listForUser({ limit: 20, page: 1, userId: user.id });
    assert.equal(stored.total, 1);
    assert.equal(stored.items[0]?.id, created.id);
  });

  it("conflicts when an authenticated idempotency key is reused for different source", async () => {
    const user = await createUser();
    const firstSource = "const firstAdmissionSource = true;";
    const conflictingSource = "const conflictingAdmissionSource = true;";
    const idempotencyKey = nextIdempotencyKey();
    await createReview(user, firstSource, idempotencyKey);

    const conflict = await postReview(user, conflictingSource, idempotencyKey);

    assert.equal(conflict.status, 409);
    assert.equal("data" in conflict.body, false);
    assert.equal(JSON.stringify(conflict.body).includes(firstSource), false);
    assert.equal(JSON.stringify(conflict.body).includes(conflictingSource), false);
    assert.equal(JSON.stringify(conflict.body).includes(idempotencyKey), false);
    assert.equal(redisExecutor.calls, 1);

    const stored = await reviewRepository.listForUser({ limit: 20, page: 1, userId: user.id });
    assert.equal(stored.total, 1);
  });

  it("creates pending reviews and omits source from list summaries", async () => {
    const user = await createUser();
    const source = "process.exit(1);\nconst answer = 42;";
    const created = await createReview(user, source);

    assert.equal(created.status, "PENDING");
    assert.equal("source" in created, false);

    const list = await request(app.getHttpServer())
      .get("/api/v1/reviews")
      .set("authorization", `Bearer ${user.accessToken}`);

    assert.equal(list.status, 200);
    assert.equal(list.body.data.items.length, 1);
    assert.equal("source" in list.body.data.items[0], false);
    assert.equal(JSON.stringify(list.body).includes(source), false);
    assert.deepEqual(list.body.data.meta, {
      hasNext: false,
      hasPrevious: false,
      limit: 20,
      page: 1,
      total: 1,
      totalPages: 1,
    });

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/reviews/${created.id}`)
      .set("authorization", `Bearer ${user.accessToken}`);

    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.source, source);
    assert.equal(detail.body.data.status, "PENDING");
  });

  it("rejects oversized and whitespace-only source input", async () => {
    const user = await createUser();
    const oversized = await request(app.getHttpServer())
      .post("/api/v1/reviews")
      .set("authorization", `Bearer ${user.accessToken}`)
      .set("Idempotency-Key", nextIdempotencyKey())
      .send({ language: "typescript", source: "x".repeat(100_001) });
    const blank = await request(app.getHttpServer())
      .post("/api/v1/reviews")
      .set("authorization", `Bearer ${user.accessToken}`)
      .set("Idempotency-Key", nextIdempotencyKey())
      .send({ language: "typescript", source: "   \n\t" });

    assert.equal(oversized.status, 400);
    assert.equal(oversized.body.error.code, "VALIDATION_FAILED");
    assert.equal(blank.status, 400);
    assert.equal(blank.body.error.code, "VALIDATION_FAILED");
  });

  it("paginates and filters only the authenticated user's active reviews", async () => {
    const user = await createUser();
    const first = await createReview(user, "const first = 1;");
    await createReview(user, "const second = 2;");
    await createReview(user, "const third = 3;");
    await reviewRepository.transitionForUser(user.id, first.id, {
      fromStatuses: ["PENDING"],
      now: new Date("2026-08-05T12:00:00.000Z"),
      toStatus: "PROCESSING",
    });

    const page = await request(app.getHttpServer())
      .get("/api/v1/reviews")
      .query({ limit: 2, page: 2 })
      .set("authorization", `Bearer ${user.accessToken}`);
    const processing = await request(app.getHttpServer())
      .get("/api/v1/reviews")
      .query({ status: "PROCESSING" })
      .set("authorization", `Bearer ${user.accessToken}`);

    assert.equal(page.status, 200);
    assert.equal(page.body.data.items.length, 1);
    assert.deepEqual(page.body.data.meta, {
      hasNext: false,
      hasPrevious: true,
      limit: 2,
      page: 2,
      total: 3,
      totalPages: 2,
    });
    assert.equal("source" in page.body.data.items[0], false);
    assert.equal(processing.status, 200);
    assert.equal(processing.body.data.meta.total, 1);
    assert.equal(processing.body.data.items[0].status, "PROCESSING");
  });

  it("prevents cross-user access and soft-deletes owned reviews", async () => {
    const owner = await createUser();
    const other = await createUser();
    const created = await createReview(owner);

    const otherDetail = await request(app.getHttpServer())
      .get(`/api/v1/reviews/${created.id}`)
      .set("authorization", `Bearer ${other.accessToken}`);
    const otherDelete = await request(app.getHttpServer())
      .delete(`/api/v1/reviews/${created.id}`)
      .set("authorization", `Bearer ${other.accessToken}`);
    const deleted = await request(app.getHttpServer())
      .delete(`/api/v1/reviews/${created.id}`)
      .set("authorization", `Bearer ${owner.accessToken}`);
    const ownerList = await request(app.getHttpServer())
      .get("/api/v1/reviews")
      .set("authorization", `Bearer ${owner.accessToken}`);
    const ownerDetail = await request(app.getHttpServer())
      .get(`/api/v1/reviews/${created.id}`)
      .set("authorization", `Bearer ${owner.accessToken}`);

    assert.equal(otherDetail.status, 404);
    assert.equal(otherDelete.status, 404);
    assert.equal(deleted.status, 204);
    assert.equal(ownerList.body.data.items.length, 0);
    assert.equal(ownerDetail.status, 404);
  });

  it("blocks cross-user retry and cancel without leaking review state", async () => {
    const owner = await createUser();
    const other = await createUser();
    const created = await createReview(owner, "const protectedReview = true;");

    const otherRetry = await request(app.getHttpServer())
      .post(`/api/v1/reviews/${created.id}/retry`)
      .set("authorization", `Bearer ${other.accessToken}`);
    const otherCancel = await request(app.getHttpServer())
      .post(`/api/v1/reviews/${created.id}/cancel`)
      .set("authorization", `Bearer ${other.accessToken}`);
    const ownerDetail = await request(app.getHttpServer())
      .get(`/api/v1/reviews/${created.id}`)
      .set("authorization", `Bearer ${owner.accessToken}`);

    for (const response of [otherRetry, otherCancel]) {
      assert.equal(response.status, 404);
      assert.equal(response.body.error.code, "NOT_FOUND");
      assert.equal("data" in response.body, false);
      assert.doesNotMatch(
        JSON.stringify(response.body),
        new RegExp(`${created.id}|PENDING|PROCESSING|COMPLETED|FAILED|CANCELLED`, "u"),
      );
    }

    assert.equal(ownerDetail.status, 200);
    assert.equal(ownerDetail.body.data.status, "PENDING");
    assert.equal(ownerDetail.body.data.source, "const protectedReview = true;");
  });

  it("exposes cancel and retry seams with conflict-safe transitions", async () => {
    const user = await createUser();
    const cancelled = await createReview(user);
    const cancel = await request(app.getHttpServer())
      .post(`/api/v1/reviews/${cancelled.id}/cancel`)
      .set("authorization", `Bearer ${user.accessToken}`);
    const retry = await request(app.getHttpServer())
      .post(`/api/v1/reviews/${cancelled.id}/retry`)
      .set("authorization", `Bearer ${user.accessToken}`);
    const completed = await createReview(user);
    const processing = await reviewRepository.transitionForUser(user.id, completed.id, {
      fromStatuses: ["PENDING"],
      now: new Date("2026-08-05T12:00:01.000Z"),
      toStatus: "PROCESSING",
    });
    assert.ok(processing);
    await reviewRepository.finalizeForUser(
      user.id,
      completed.id,
      validExecution,
      new Date("2026-08-05T12:00:02.000Z"),
      processing.processingGeneration,
    );
    const invalidRetry = await request(app.getHttpServer())
      .post(`/api/v1/reviews/${completed.id}/retry`)
      .set("authorization", `Bearer ${user.accessToken}`);
    const cancelAgain = await request(app.getHttpServer())
      .post(`/api/v1/reviews/${cancelled.id}/cancel`)
      .set("authorization", `Bearer ${user.accessToken}`);
    const repeatedCancel = await request(app.getHttpServer())
      .post(`/api/v1/reviews/${cancelled.id}/cancel`)
      .set("authorization", `Bearer ${user.accessToken}`);

    assert.equal(cancel.status, 201);
    assert.equal(cancel.body.data.status, "CANCELLED");
    assert.equal(retry.status, 201);
    assert.equal(retry.body.data.status, "PENDING");
    assert.equal(invalidRetry.status, 409);
    assert.equal(cancelAgain.status, 201);
    assert.equal(repeatedCancel.status, 409);
  });

  it("processes an owned review through injected Luna and returns a stable source-free response", async () => {
    const user = await createUser();
    const source = "const processOnly = 'source should not be returned';";
    const created = await createReview(user, source);

    const overrideAttempt = await request(app.getHttpServer())
      .post(`/api/v1/reviews/${created.id}/process`)
      .set("authorization", `Bearer ${user.accessToken}`)
      .send({ model: "other-model", prompt: "override", provider: "deepseek" });

    assert.equal(overrideAttempt.status, 400);
    assert.equal(overrideAttempt.body.error.code, "BAD_REQUEST");
    assert.equal(provider.requests.length, 0);

    const processed = await request(app.getHttpServer())
      .post(`/api/v1/reviews/${created.id}/process`)
      .set("authorization", `Bearer ${user.accessToken}`)
      .send({});

    assert.equal(processed.status, 200);
    assert.deepEqual(processed.body.data, {
      id: created.id,
      outcome: "COMPLETED",
      resultAvailable: true,
      status: "COMPLETED",
    });
    assert.equal(JSON.stringify(processed.body).includes(source), false);
    assert.equal(provider.requests.length, 1);
    assert.equal(provider.requests[0]?.provider, "luna");
    assert.equal(provider.requests[0]?.model, "gpt-5.6-luna");

    const repeated = await request(app.getHttpServer())
      .post(`/api/v1/reviews/${created.id}/process`)
      .set("authorization", `Bearer ${user.accessToken}`)
      .send({});

    assert.equal(repeated.status, 200);
    assert.deepEqual(repeated.body.data, {
      id: created.id,
      outcome: "SKIPPED",
      reason: "ALREADY_COMPLETED",
      resultAvailable: true,
      status: "COMPLETED",
    });
    assert.equal(provider.requests.length, 1);
  });

  it("streams the owner lifecycle as raw bounded SSE with exclusive replay and safe reset", async () => {
    const owner = await createUser();
    const other = await createUser();
    const source = "const streamSecret = 'must never cross SSE';";
    const created = await createReview(owner, source);

    const processed = await request(app.getHttpServer())
      .post(`/api/v1/reviews/${created.id}/process`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({});
    assert.equal(processed.status, 200);

    const initial = await request(app.getHttpServer())
      .get(`/api/v1/reviews/${created.id}/events`)
      .set("authorization", `Bearer ${owner.accessToken}`);
    assert.equal(initial.status, 200);
    const contentType = initial.headers["content-type"];
    assert.ok(contentType);
    assert.match(contentType, /^text\/event-stream/u);
    assert.equal(initial.headers["cache-control"], "no-cache, no-transform");
    assert.equal(initial.headers["x-accel-buffering"], "no");

    const initialFrames = parseSse(initial.text);
    assert.deepEqual(
      initialFrames.map((frame) => frame.id),
      ["1", "2", "3"],
    );
    assert.deepEqual(
      initialFrames.map((frame) => frame.event),
      ["snapshot", "snapshot", "completed"],
    );
    for (const frame of initialFrames) {
      assert.equal("source" in frame.data, false);
      assert.equal("provider" in frame.data, false);
      assert.equal("usage" in frame.data, false);
      assert.equal("error" in frame.data, false);
      assert.equal(/"result"\s*:/u.test(JSON.stringify(frame.data)), false);
      assert.deepEqual(
        Object.keys(frame.data).sort(),
        frame.event === "snapshot"
          ? [
              "generation",
              "id",
              "replay",
              "resultAvailable",
              "reviewId",
              "schemaVersion",
              "status",
              "type",
            ]
          : ["generation", "id", "resultAvailable", "reviewId", "schemaVersion", "status", "type"],
      );
    }
    assert.equal(JSON.stringify(initial.body ?? initial.text).includes(source), false);

    const replay = await request(app.getHttpServer())
      .get(`/api/v1/reviews/${created.id}/events`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .set("Last-Event-ID", "1");
    assert.equal(replay.status, 200);
    assert.deepEqual(
      parseSse(replay.text).map((frame) => frame.id),
      ["2", "3"],
    );

    const reset = await request(app.getHttpServer())
      .get(`/api/v1/reviews/${created.id}/events`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .set("Last-Event-ID", "999");
    const resetFrames = parseSse(reset.text);
    assert.equal(reset.status, 200);
    assert.deepEqual(
      resetFrames.map((frame) => frame.id),
      ["3"],
    );
    assert.equal(resetFrames[0]?.event, "snapshot");
    assert.equal(resetFrames[0]?.data.replay, "reset");
    assert.equal(resetFrames[0]?.data.status, "COMPLETED");

    const unauthenticated = await request(app.getHttpServer()).get(
      `/api/v1/reviews/${created.id}/events`,
    );
    const otherStream = await request(app.getHttpServer())
      .get(`/api/v1/reviews/${created.id}/events`)
      .set("authorization", `Bearer ${other.accessToken}`);
    assert.equal(unauthenticated.status, 401);
    assert.equal(otherStream.status, 404);
    assert.equal(JSON.stringify(otherStream.body).includes(created.id), false);
  });

  it("returns an owner-scoped validated persisted result with safe execution metadata", async () => {
    const user = await createUser();
    const source = "const resultOnly = true;";
    const created = await createReview(user, source);
    const processed = await request(app.getHttpServer())
      .post(`/api/v1/reviews/${created.id}/process`)
      .set("authorization", `Bearer ${user.accessToken}`)
      .send({});
    assert.equal(processed.status, 200);

    const result = await request(app.getHttpServer())
      .get(`/api/v1/reviews/${created.id}/result`)
      .set("authorization", `Bearer ${user.accessToken}`);

    assert.equal(result.status, 200);
    assert.equal(result.body.data.id, created.id);
    assert.equal(result.body.data.status, "COMPLETED");
    assert.deepEqual(result.body.data.result, validExecution.result);
    assert.deepEqual(result.body.data.execution.usage, validExecution.usage);
    assert.equal(result.body.data.execution.provider, "luna");
    assert.equal(result.body.data.execution.model, "gpt-5.6-luna");
    assert.equal(result.body.data.execution.reasoningEffort, "medium");
    assert.equal(result.body.data.execution.attempts, 1);
    assert.equal(typeof result.body.data.execution.durationMs, "number");
    assert.equal(typeof result.body.data.execution.completedAt, "string");
    assert.equal("source" in result.body.data, false);
    assert.equal(JSON.stringify(result.body).includes(source), false);
  });

  it("returns already-processing idempotency and withholds non-completed results", async () => {
    const user = await createUser();
    const source = "const stillProcessing = true;";
    const created = await createReview(user, source);
    await reviewRepository.transitionForUser(user.id, created.id, {
      fromStatuses: ["PENDING"],
      now: new Date("2026-08-06T01:00:00.000Z"),
      toStatus: "PROCESSING",
    });

    const process = await request(app.getHttpServer())
      .post(`/api/v1/reviews/${created.id}/process`)
      .set("authorization", `Bearer ${user.accessToken}`)
      .send({});
    const result = await request(app.getHttpServer())
      .get(`/api/v1/reviews/${created.id}/result`)
      .set("authorization", `Bearer ${user.accessToken}`);

    assert.equal(process.status, 200);
    assert.deepEqual(process.body.data, {
      id: created.id,
      outcome: "SKIPPED",
      reason: "ALREADY_PROCESSING",
      resultAvailable: false,
      status: "PROCESSING",
    });
    assert.equal(provider.requests.length, 0);
    assert.equal(result.status, 409);
    assert.equal(result.body.error.code, "CONFLICT");
    assert.equal("data" in result.body, false);
    assert.equal(JSON.stringify(result.body).includes(source), false);
  });

  it("documents processing and result transport envelopes in Swagger", async () => {
    const documentation = await request(app.getHttpServer()).get("/api/docs-json");

    assert.equal(documentation.status, 200);
    const processOperation = documentation.body.paths["/api/v1/reviews/{id}/process"].post;
    const resultOperation = documentation.body.paths["/api/v1/reviews/{id}/result"].get;
    const eventsOperation = documentation.body.paths["/api/v1/reviews/{id}/events"].get;

    assert.equal(processOperation.requestBody.required, false);
    assert.match(
      JSON.stringify(processOperation.responses["200"]),
      /ReviewProcessingCompletedResponseDto/u,
    );
    assert.match(
      JSON.stringify(processOperation.responses["200"]),
      /ReviewProcessingAlreadyProcessingResponseDto/u,
    );
    assert.match(JSON.stringify(resultOperation.responses["200"]), /ReviewResultResponseDto/u);
    assert.ok(eventsOperation.responses["200"].content["text/event-stream"]);
  });

  it("keeps processing and result retrieval isolated by owner and authentication", async () => {
    const owner = await createUser();
    const other = await createUser();
    const source = "const ownerOnly = true;";
    const created = await createReview(owner, source);

    const unauthenticated = await request(app.getHttpServer()).post(
      `/api/v1/reviews/${created.id}/process`,
    );
    const otherProcess = await request(app.getHttpServer())
      .post(`/api/v1/reviews/${created.id}/process`)
      .set("authorization", `Bearer ${other.accessToken}`)
      .send({});
    const otherResult = await request(app.getHttpServer())
      .get(`/api/v1/reviews/${created.id}/result`)
      .set("authorization", `Bearer ${other.accessToken}`);

    assert.equal(unauthenticated.status, 401);
    assert.equal(otherProcess.status, 404);
    assert.equal(otherResult.status, 404);
    assert.equal(provider.requests.length, 0);
    for (const response of [otherProcess, otherResult]) {
      assert.equal("data" in response.body, false);
      assert.equal(JSON.stringify(response.body).includes(created.id), false);
      assert.equal(JSON.stringify(response.body).includes(source), false);
    }
  });

  it("maps provider failures and cancellation to safe API categories", async () => {
    const failedUser = await createUser();
    const failedSource = "const providerFailureSource = 'private';";
    const failedReview = await createReview(failedUser, failedSource);
    providerFailure = new Error(`provider secret ${failedSource}`);

    const failed = await request(app.getHttpServer())
      .post(`/api/v1/reviews/${failedReview.id}/process`)
      .set("authorization", `Bearer ${failedUser.accessToken}`)
      .send({});

    assert.equal(failed.status, 502);
    assert.equal(failed.body.error.code, "DEPENDENCY_UNAVAILABLE");
    assert.equal(JSON.stringify(failed.body).includes("provider secret"), false);
    assert.equal(JSON.stringify(failed.body).includes(failedSource), false);
    assert.equal(JSON.stringify(failed.body).includes("stack"), false);

    const providerMappingCases = [
      { code: "AUTHENTICATION", problemCode: "DEPENDENCY_UNAVAILABLE", status: 502 },
      { code: "TIMEOUT", problemCode: "DEPENDENCY_UNAVAILABLE", status: 504 },
      { code: "UNAVAILABLE", problemCode: "DEPENDENCY_UNAVAILABLE", status: 503 },
      { code: "RATE_LIMITED", problemCode: "RATE_LIMITED", status: 429 },
    ] as const;
    for (const mappingCase of providerMappingCases) {
      providerFailure = new AiProviderError(mappingCase.code, { retryable: true });
      rateLimiter.clear();
      const mappedUser = await createUser();
      const mappedSource = `const ${mappingCase.code.toLowerCase()}Source = 'private';`;
      const mappedReview = await createReview(mappedUser, mappedSource);
      const mapped = await request(app.getHttpServer())
        .post(`/api/v1/reviews/${mappedReview.id}/process`)
        .set("authorization", `Bearer ${mappedUser.accessToken}`)
        .send({});

      assert.equal(mapped.status, mappingCase.status);
      assert.equal(mapped.body.error.code, mappingCase.problemCode);
      assert.equal(JSON.stringify(mapped.body).includes(mappedSource), false);
      assert.equal(JSON.stringify(mapped.body).includes("providerCode"), false);
      assert.equal(JSON.stringify(mapped.body).includes("stack"), false);
    }

    providerFailure = new AiProviderError("CANCELLED");
    rateLimiter.clear();
    const cancelledUser = await createUser();
    const cancelledReview = await createReview(cancelledUser, "const cancellationSource = true;");
    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/reviews/${cancelledReview.id}/process`)
      .set("authorization", `Bearer ${cancelledUser.accessToken}`)
      .send({});

    assert.equal(cancelled.status, 409);
    assert.equal(cancelled.body.error.code, "CONFLICT");
    assert.equal(JSON.stringify(cancelled.body).includes("CANCELLED"), false);
    assert.equal(provider.requests.length, 6);
  });

  it("maps invalid identifiers and pending result reads without exposing state data", async () => {
    const user = await createUser();
    const created = await createReview(user, "const pendingResult = true;");
    const missing = await request(app.getHttpServer())
      .post("/api/v1/reviews/not-a-real-review/process")
      .set("authorization", `Bearer ${user.accessToken}`)
      .send({});
    const malformed = await request(app.getHttpServer())
      .get(`/api/v1/reviews/${"x".repeat(26)}/result`)
      .set("authorization", `Bearer ${user.accessToken}`);
    const pending = await request(app.getHttpServer())
      .get(`/api/v1/reviews/${created.id}/result`)
      .set("authorization", `Bearer ${user.accessToken}`);

    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, "NOT_FOUND");
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.code, "VALIDATION_FAILED");
    assert.equal(pending.status, 409);
    assert.equal(pending.body.error.code, "CONFLICT");
    assert.equal("data" in pending.body, false);
  });
});
