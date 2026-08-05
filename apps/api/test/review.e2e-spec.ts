import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.js";
import { AuthRateLimiter } from "../src/modules/auth/auth-rate-limiter.js";
import { AuthTokenService } from "../src/modules/auth/auth-token.service.js";
import { AUTH_REPOSITORY } from "../src/modules/auth/auth.types.js";
import { InMemoryAuthRepository } from "../src/modules/auth/in-memory-auth.repository.js";
import { InMemoryReviewRepository } from "../src/modules/review/in-memory-review.repository.js";
import { REVIEW_REPOSITORY } from "../src/modules/review/review.types.js";

const tokenConfig = {
  accessSecret: "access-secret-for-review-controller-tests-32-bytes",
  accessTtlSeconds: 900,
  cookieSameSite: "lax" as const,
  cookieSecure: true,
  refreshSecret: "refresh-secret-for-review-controller-tests-32-bytes",
  refreshTtlSeconds: 7_200,
};

interface ReviewUser {
  readonly accessToken: string;
  readonly id: string;
}

describe("review API", () => {
  let app: INestApplication;
  let authRepository: InMemoryAuthRepository;
  let reviewRepository: InMemoryReviewRepository;
  let rateLimiter: AuthRateLimiter;
  let userSequence = 0;

  before(async () => {
    authRepository = new InMemoryAuthRepository();
    reviewRepository = new InMemoryReviewRepository();
    const tokenService = new AuthTokenService(tokenConfig);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_REPOSITORY)
      .useValue(authRepository)
      .overrideProvider(AuthTokenService)
      .useValue(tokenService)
      .overrideProvider(REVIEW_REPOSITORY)
      .useValue(reviewRepository)
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

  async function createReview(user: ReviewUser, source = "const answer = 42;") {
    const response = await request(app.getHttpServer())
      .post("/api/v1/reviews")
      .set("authorization", `Bearer ${user.accessToken}`)
      .send({ language: "TypeScript", source });
    assert.equal(response.status, 201);
    return response.body.data as { id: string; status: string };
  }

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
      .send({ language: "typescript", source: "x".repeat(100_001) });
    const blank = await request(app.getHttpServer())
      .post("/api/v1/reviews")
      .set("authorization", `Bearer ${user.accessToken}`)
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
    await reviewRepository.transitionForUser(user.id, completed.id, {
      fromStatuses: ["PENDING"],
      now: new Date("2026-08-05T12:00:01.000Z"),
      toStatus: "PROCESSING",
    });
    await reviewRepository.transitionForUser(user.id, completed.id, {
      fromStatuses: ["PROCESSING"],
      now: new Date("2026-08-05T12:00:02.000Z"),
      toStatus: "COMPLETED",
    });
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
});
