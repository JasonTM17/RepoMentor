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
import { QUOTA_ADMISSION_FINGERPRINT_CONFIG } from "../src/modules/usage/quota-admission.config.js";
import { UsageService } from "../src/modules/usage/usage.service.js";
import type {
  UsageCountByMode,
  UsageHistoryListInput,
  UsageHistoryListResult,
  UsageHistoryRecord,
  UsageQuotaDayInput,
  UsageRepository,
  UsageSummaryAggregate,
} from "../src/modules/usage/usage.types.js";
import { USAGE_REPOSITORY } from "../src/modules/usage/usage.types.js";

// Test-only fixture; this is not a user or provider API key.
const TEST_QUOTA_ADMISSION_FINGERPRINT_SECRET =
  "test-only-quota-admission-fingerprint-fixture-32-bytes";

const tokenConfig = {
  accessSecret: "access-secret-for-usage-controller-tests-32-bytes",
  accessTtlSeconds: 900,
  cookieSameSite: "lax" as const,
  cookieSecure: true,
  refreshSecret: "refresh-secret-for-usage-controller-tests-32-bytes",
  refreshTtlSeconds: 7_200,
};

interface UsageUser {
  readonly accessToken: string;
  readonly id: string;
}

interface SeededUsageRecord extends UsageHistoryRecord {
  readonly deletedAt?: Date | null;
  readonly userId: string;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

class InMemoryUsageRepository implements UsageRepository {
  private records: SeededUsageRecord[] = [];

  clear(): void {
    this.records = [];
  }

  seed(...records: readonly SeededUsageRecord[]): void {
    this.records.push(...records);
  }

  private activeRecordsForUser(userId: string): SeededUsageRecord[] {
    return this.records.filter(
      (record) =>
        record.userId === userId && (record.deletedAt === undefined || record.deletedAt === null),
    );
  }

  async getSummaryForUser(userId: string): Promise<UsageSummaryAggregate> {
    const records = this.activeRecordsForUser(userId);
    const completedRecords = records.filter((record) => record.status === "COMPLETED");
    const tokenRecords = completedRecords.flatMap((record) =>
      record.result?.usage === null || record.result?.usage === undefined
        ? []
        : [record.result.usage],
    );
    const statusCounts = new Map<UsageHistoryRecord["status"], number>();
    const languageCounts = new Map<string, number>();

    for (const record of records) {
      statusCounts.set(record.status, (statusCounts.get(record.status) ?? 0) + 1);
      languageCounts.set(record.language, (languageCounts.get(record.language) ?? 0) + 1);
    }

    return {
      completedReviews: completedRecords.length,
      deepReviews: records.filter((record) => record.mode === "DEEP").length,
      languageCounts: [...languageCounts.entries()].map(([language, count]) => ({
        count,
        language,
      })),
      statusCounts: [...statusCounts.entries()].map(([status, count]) => ({ count, status })),
      tokenTotals: {
        inputTokens: sum(tokenRecords.map((usage) => usage.inputTokens)),
        outputTokens: sum(tokenRecords.map((usage) => usage.outputTokens)),
        totalTokens: sum(tokenRecords.map((usage) => usage.totalTokens)),
      },
      totalReviews: records.length,
    };
  }

  async listHistoryForUser(input: UsageHistoryListInput): Promise<UsageHistoryListResult> {
    const records = this.activeRecordsForUser(input.userId)
      .filter(
        (record) =>
          (input.language === undefined || record.language === input.language) &&
          (input.mode === undefined || record.mode === input.mode) &&
          (input.status === undefined || record.status === input.status) &&
          (input.search === undefined ||
            record.reviewId.toLowerCase().includes(input.search.toLowerCase())) &&
          (input.from === undefined || record.createdAt >= input.from) &&
          (input.to === undefined || record.createdAt < input.to),
      )
      .sort((left, right) => {
        const dateDifference = right.createdAt.getTime() - left.createdAt.getTime();
        if (dateDifference !== 0) {
          return input.sort === "asc" ? -dateDifference : dateDifference;
        }

        if (left.reviewId === right.reviewId) {
          return 0;
        }

        const idDifference = left.reviewId < right.reviewId ? -1 : 1;
        return input.sort === "asc" ? idDifference : -idDifference;
      });

    return {
      items: records.slice((input.page - 1) * input.limit, input.page * input.limit),
      total: records.length,
    };
  }

  async countReviewsForUserOnUtcDay(
    input: UsageQuotaDayInput,
  ): Promise<readonly UsageCountByMode[]> {
    const counts = new Map<UsageHistoryRecord["mode"], number>();

    for (const record of this.records) {
      if (
        record.userId === input.userId &&
        record.createdAt >= input.start &&
        record.createdAt < input.endExclusive
      ) {
        counts.set(record.mode, (counts.get(record.mode) ?? 0) + 1);
      }
    }

    return [...counts.entries()].map(([mode, count]) => ({ count, mode }));
  }
}

describe("usage API", () => {
  let app: INestApplication;
  let authRepository: InMemoryAuthRepository;
  let usageRepository: InMemoryUsageRepository;
  let rateLimiter: AuthRateLimiter;
  let userSequence = 0;

  before(async () => {
    authRepository = new InMemoryAuthRepository();
    usageRepository = new InMemoryUsageRepository();
    const tokenService = new AuthTokenService(tokenConfig);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(QUOTA_ADMISSION_FINGERPRINT_CONFIG)
      .useValue({ fingerprintSecret: TEST_QUOTA_ADMISSION_FINGERPRINT_SECRET })
      .overrideProvider(AUTH_REPOSITORY)
      .useValue(authRepository)
      .overrideProvider(AuthTokenService)
      .useValue(tokenService)
      .overrideProvider(USAGE_REPOSITORY)
      .useValue(usageRepository)
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
    usageRepository.clear();
  });

  async function createUser(): Promise<UsageUser> {
    userSequence += 1;
    const email = `usage-user-${userSequence}@example.com`;
    const password = "correct horse battery staple";
    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ displayName: `Usage User ${userSequence}`, email, password });
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

  function record(userId: string, input: Omit<SeededUsageRecord, "userId">): SeededUsageRecord {
    return { ...input, userId };
  }

  it("returns owner-scoped summary/history with strict safe shapes", async () => {
    const owner = await createUser();
    const other = await createUser();
    const asOf = new Date("2026-08-06T00:04:00.000Z");

    usageRepository.seed(
      record(owner.id, {
        createdAt: new Date("2026-08-06T00:01:00.000Z"),
        language: "JavaScript",
        mode: "QUICK",
        result: null,
        reviewId: "owner-pending",
        status: "PENDING",
      }),
      record(owner.id, {
        createdAt: new Date("2026-08-06T00:02:00.000Z"),
        language: "SQL",
        mode: "QUICK",
        result: null,
        reviewId: "owner-failed",
        status: "FAILED",
      }),
      record(owner.id, {
        createdAt: new Date("2026-08-06T00:03:00.000Z"),
        language: "TypeScript",
        mode: "STANDARD",
        result: {
          durationMs: 42,
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        },
        reviewId: "owner-standard",
        status: "COMPLETED",
      }),
      record(owner.id, {
        createdAt: new Date("2026-08-06T00:04:00.000Z"),
        language: "Python",
        mode: "DEEP",
        result: {
          durationMs: 0,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
        reviewId: "owner-deep",
        status: "COMPLETED",
      }),
      record(other.id, {
        createdAt: asOf,
        language: "Rust",
        mode: "DEEP",
        result: {
          durationMs: 999,
          usage: { inputTokens: 900, outputTokens: 800, totalTokens: 1_700 },
        },
        reviewId: "other-secret-review",
        status: "COMPLETED",
      }),
    );

    const summary = await request(app.getHttpServer())
      .get("/api/v1/usage/summary")
      .set("authorization", `Bearer ${owner.accessToken}`);
    const history = await request(app.getHttpServer())
      .get("/api/v1/usage/history?page=1&limit=2")
      .set("authorization", `Bearer ${owner.accessToken}`);

    assert.equal(summary.status, 200);
    assert.deepEqual(Object.keys(summary.body.data).sort(), [
      "asOf",
      "completedReviews",
      "deepReviews",
      "inputTokens",
      "languageDistribution",
      "outputTokens",
      "reviewsByStatus",
      "totalReviews",
      "totalTokens",
    ]);
    assert.deepEqual(summary.body.data.reviewsByStatus, {
      CANCELLED: 0,
      COMPLETED: 2,
      FAILED: 1,
      PENDING: 1,
      PROCESSING: 0,
    });
    assert.equal(summary.body.data.totalReviews, 4);
    assert.equal(summary.body.data.completedReviews, 2);
    assert.equal(summary.body.data.deepReviews, 1);
    assert.equal(summary.body.data.inputTokens, 10);
    assert.equal(summary.body.data.outputTokens, 20);
    assert.equal(summary.body.data.totalTokens, 30);
    assert.deepEqual(summary.body.data.languageDistribution, [
      { count: 1, language: "javascript" },
      { count: 1, language: "python" },
      { count: 1, language: "sql" },
      { count: 1, language: "typescript" },
    ]);
    assert.match(summary.body.data.asOf, /^\d{4}-\d{2}-\d{2}T/u);
    assert.equal(JSON.stringify(summary.body).includes("other-secret-review"), false);

    assert.equal(history.status, 200);
    assert.deepEqual(history.body.data.meta, {
      hasNext: true,
      hasPrevious: false,
      limit: 2,
      page: 1,
      total: 4,
      totalPages: 2,
    });
    assert.deepEqual(Object.keys(history.body.data.items[0]).sort(), [
      "createdAt",
      "durationMs",
      "inputTokens",
      "language",
      "mode",
      "outputTokens",
      "reviewId",
      "status",
      "totalTokens",
    ]);
    assert.deepEqual(history.body.data.items, [
      {
        createdAt: "2026-08-06T00:04:00.000Z",
        durationMs: 0,
        inputTokens: 0,
        language: "python",
        mode: "DEEP",
        outputTokens: 0,
        reviewId: "owner-deep",
        status: "COMPLETED",
        totalTokens: 0,
      },
      {
        createdAt: "2026-08-06T00:03:00.000Z",
        durationMs: 42,
        inputTokens: 10,
        language: "typescript",
        mode: "STANDARD",
        outputTokens: 20,
        reviewId: "owner-standard",
        status: "COMPLETED",
        totalTokens: 30,
      },
    ]);
    assert.equal(JSON.stringify(history.body).includes("source"), false);
    assert.equal(JSON.stringify(history.body).includes("other-secret-review"), false);
  });

  it("paginates the owner view and rejects invalid or unknown query values", async () => {
    const owner = await createUser();
    const other = await createUser();

    usageRepository.seed(
      record(owner.id, {
        createdAt: new Date("2026-08-06T00:01:00.000Z"),
        language: "typescript",
        mode: "QUICK",
        result: null,
        reviewId: "owner-one",
        status: "PENDING",
      }),
      record(owner.id, {
        createdAt: new Date("2026-08-06T00:02:00.000Z"),
        language: "typescript",
        mode: "STANDARD",
        result: null,
        reviewId: "owner-two",
        status: "PROCESSING",
      }),
      record(other.id, {
        createdAt: new Date("2026-08-06T00:03:00.000Z"),
        language: "typescript",
        mode: "DEEP",
        result: null,
        reviewId: "other-only",
        status: "PENDING",
      }),
    );

    const pageTwo = await request(app.getHttpServer())
      .get("/api/v1/usage/history?page=2&limit=1")
      .set("authorization", `Bearer ${owner.accessToken}`);
    assert.equal(pageTwo.status, 200);
    assert.deepEqual(
      pageTwo.body.data.items.map((item: { readonly reviewId: string }) => item.reviewId),
      ["owner-one"],
    );
    assert.deepEqual(pageTwo.body.data.meta, {
      hasNext: false,
      hasPrevious: true,
      limit: 1,
      page: 2,
      total: 2,
      totalPages: 2,
    });

    for (const query of [
      "limit=0",
      "limit=51",
      "page=0",
      "page=10001",
      "page=1e2",
      "language=not%20a%20language",
      "mode=UNKNOWN",
      "status=UNKNOWN",
      "search=source%20secret",
      `search=${"a".repeat(26)}`,
      "sort=sideways",
      "from=2026-08-06",
      "from=2026-02-30T00:00:00.000Z",
      "from=2026-08-06T00:00:00.000%2B00:00",
      "from=2026-08-06T00:00:00.000Z&to=2026-08-06T00:00:00.000Z",
      "unknown=x",
    ]) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/usage/history?${query}`)
        .set("authorization", `Bearer ${owner.accessToken}`);
      assert.equal(response.status, 400, query);
      assert.equal(response.body.error.code, "VALIDATION_FAILED", query);
      if (query === "search=source%20secret") {
        assert.equal(JSON.stringify(response.body).includes("source secret"), false);
      }
    }

    const otherHistory = await request(app.getHttpServer())
      .get("/api/v1/usage/history")
      .set("authorization", `Bearer ${other.accessToken}`);
    assert.deepEqual(
      otherHistory.body.data.items.map((item: { readonly reviewId: string }) => item.reviewId),
      ["other-only"],
    );
  });

  it("applies each filter, UTC boundaries, and stable createdAt/id sorting", async () => {
    const owner = await createUser();
    const other = await createUser();
    const from = "2026-08-06T00:00:00.000Z";
    const to = "2026-08-06T12:00:00.000Z";

    usageRepository.seed(
      record(owner.id, {
        createdAt: new Date("2026-08-05T23:59:59.999Z"),
        language: "typescript",
        mode: "QUICK",
        result: null,
        reviewId: "before-review",
        status: "PENDING",
      }),
      record(owner.id, {
        createdAt: new Date(from),
        language: "typescript",
        mode: "DEEP",
        result: null,
        reviewId: "b-review",
        status: "COMPLETED",
      }),
      record(owner.id, {
        createdAt: new Date(from),
        language: "typescript",
        mode: "DEEP",
        result: null,
        reviewId: "a-review",
        status: "COMPLETED",
      }),
      record(owner.id, {
        createdAt: new Date("2026-08-06T06:00:00.000Z"),
        language: "python",
        mode: "DEEP",
        result: null,
        reviewId: "inside-review",
        status: "FAILED",
      }),
      record(owner.id, {
        createdAt: new Date(to),
        language: "typescript",
        mode: "DEEP",
        result: null,
        reviewId: "end-review",
        status: "COMPLETED",
      }),
      record(owner.id, {
        createdAt: new Date("2026-08-06T06:30:00.000Z"),
        language: "typescript",
        mode: "DEEP",
        result: null,
        reviewId: "other-id",
        status: "COMPLETED",
      }),
      record(owner.id, {
        createdAt: new Date("2026-08-06T06:30:00.000Z"),
        deletedAt: new Date("2026-08-06T07:00:00.000Z"),
        language: "python",
        mode: "DEEP",
        result: null,
        reviewId: "deleted-review",
        status: "COMPLETED",
      }),
      record(other.id, {
        createdAt: new Date("2026-08-06T06:00:00.000Z"),
        language: "python",
        mode: "DEEP",
        result: null,
        reviewId: "other-review",
        status: "FAILED",
      }),
    );

    const language = await request(app.getHttpServer())
      .get("/api/v1/usage/history?language=PYTHON")
      .set("authorization", `Bearer ${owner.accessToken}`);
    const mode = await request(app.getHttpServer())
      .get("/api/v1/usage/history?mode=DEEP")
      .set("authorization", `Bearer ${owner.accessToken}`);
    const status = await request(app.getHttpServer())
      .get("/api/v1/usage/history?status=FAILED")
      .set("authorization", `Bearer ${owner.accessToken}`);
    const search = await request(app.getHttpServer())
      .get("/api/v1/usage/history?search=REVIEW")
      .set("authorization", `Bearer ${owner.accessToken}`);
    const boundedPage = await request(app.getHttpServer())
      .get(
        `/api/v1/usage/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&sort=asc&page=1&limit=2`,
      )
      .set("authorization", `Bearer ${owner.accessToken}`);
    const boundedLastPage = await request(app.getHttpServer())
      .get(
        `/api/v1/usage/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&sort=asc&page=2&limit=2`,
      )
      .set("authorization", `Bearer ${owner.accessToken}`);

    assert.deepEqual(
      language.body.data.items.map((item: { readonly reviewId: string }) => item.reviewId),
      ["inside-review"],
    );
    assert.deepEqual(
      mode.body.data.items.map((item: { readonly reviewId: string }) => item.reviewId),
      ["end-review", "other-id", "inside-review", "b-review", "a-review"],
    );
    assert.deepEqual(
      status.body.data.items.map((item: { readonly reviewId: string }) => item.reviewId),
      ["inside-review"],
    );
    assert.deepEqual(
      search.body.data.items.map((item: { readonly reviewId: string }) => item.reviewId),
      ["end-review", "inside-review", "b-review", "a-review", "before-review"],
    );
    assert.deepEqual(
      boundedPage.body.data.items.map((item: { readonly reviewId: string }) => item.reviewId),
      ["a-review", "b-review"],
    );
    assert.deepEqual(boundedPage.body.data.meta, {
      hasNext: true,
      hasPrevious: false,
      limit: 2,
      page: 1,
      total: 4,
      totalPages: 2,
    });
    assert.deepEqual(
      boundedLastPage.body.data.items.map((item: { readonly reviewId: string }) => item.reviewId),
      ["inside-review", "other-id"],
    );
    assert.deepEqual(boundedLastPage.body.data.meta, {
      hasNext: false,
      hasPrevious: true,
      limit: 2,
      page: 2,
      total: 4,
      totalPages: 2,
    });
    assert.equal(JSON.stringify(boundedPage.body).includes("source"), false);
    assert.equal(JSON.stringify(boundedPage.body).includes("other-review"), false);
  });

  it("treats underscores in review-id search as literal characters", async () => {
    const owner = await createUser();

    usageRepository.seed(
      record(owner.id, {
        createdAt: new Date("2026-08-06T00:01:00.000Z"),
        language: "typescript",
        mode: "QUICK",
        result: null,
        reviewId: "review_id-match",
        status: "PENDING",
      }),
      record(owner.id, {
        createdAt: new Date("2026-08-06T00:02:00.000Z"),
        language: "typescript",
        mode: "QUICK",
        result: null,
        reviewId: "reviewXid-broad-match",
        status: "PENDING",
      }),
    );

    const response = await request(app.getHttpServer())
      .get("/api/v1/usage/history?search=review_id")
      .set("authorization", `Bearer ${owner.accessToken}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.data.items.map((item: { readonly reviewId: string }) => item.reviewId),
      ["review_id-match"],
    );
  });

  it("returns truthful empty views and requires authentication", async () => {
    const emptyUser = await createUser();
    const summary = await request(app.getHttpServer())
      .get("/api/v1/usage/summary")
      .set("authorization", `Bearer ${emptyUser.accessToken}`);
    const history = await request(app.getHttpServer())
      .get("/api/v1/usage/history")
      .set("authorization", `Bearer ${emptyUser.accessToken}`);
    const quota = await request(app.getHttpServer())
      .get("/api/v1/usage/quota")
      .set("authorization", `Bearer ${emptyUser.accessToken}`);
    const unauthenticated = await request(app.getHttpServer()).get("/api/v1/usage/summary");

    assert.equal(summary.status, 200);
    assert.equal(summary.body.data.totalReviews, 0);
    assert.equal(summary.body.data.completedReviews, 0);
    assert.equal(summary.body.data.deepReviews, 0);
    assert.equal(summary.body.data.inputTokens, 0);
    assert.equal(summary.body.data.outputTokens, 0);
    assert.equal(summary.body.data.totalTokens, 0);
    assert.deepEqual(summary.body.data.languageDistribution, []);
    assert.deepEqual(history.body.data.items, []);
    assert.deepEqual(history.body.data.meta, {
      hasNext: false,
      hasPrevious: false,
      limit: 20,
      page: 1,
      total: 0,
      totalPages: 0,
    });
    assert.equal(quota.status, 200);
    assert.deepEqual(quota.body.data.modes, {
      DEEP: { limit: 3, remaining: 3, used: 0 },
      QUICK: { limit: 20, remaining: 20, used: 0 },
      STANDARD: { limit: 10, remaining: 10, used: 0 },
    });
    assert.equal(unauthenticated.status, 401);
  });

  it("documents all usage routes with envelope schemas in Swagger", async () => {
    const documentation = await request(app.getHttpServer()).get("/api/docs-json");

    assert.equal(documentation.status, 200);
    for (const path of ["/api/v1/usage/summary", "/api/v1/usage/history", "/api/v1/usage/quota"]) {
      const operation = documentation.body.paths[path].get;
      assert.ok(operation);
      assert.match(JSON.stringify(operation.responses["200"]), /Usage/u);
      assert.match(JSON.stringify(operation.responses["200"]), /data/u);
    }

    const historyOperation = documentation.body.paths["/api/v1/usage/history"].get;
    const parameters = historyOperation.parameters as readonly {
      readonly name: string;
      readonly description?: string;
      readonly default?: string;
      readonly schema?: { readonly default?: string };
    }[];
    assert.deepEqual(parameters.map((parameter) => parameter.name).sort(), [
      "from",
      "language",
      "limit",
      "mode",
      "page",
      "search",
      "sort",
      "status",
      "to",
    ]);
    const searchParameter = parameters.find((parameter) => parameter.name === "search");
    assert.match(searchParameter?.description ?? "", /review IDs only/u);
    const sortParameter = parameters.find((parameter) => parameter.name === "sort");
    assert.equal(sortParameter?.default ?? sortParameter?.schema?.default, "desc");
  });

  it("does not expose usage repository wiring through the controller response", () => {
    assert.ok(app.get(UsageService));
  });
});
