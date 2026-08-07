import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AI_REVIEW_PROVIDER } from "../src/modules/ai/ai.types.js";
import { AiProviderError } from "../src/modules/ai/ai.errors.js";
import { FakeAiReviewProvider } from "../src/modules/ai/fake-ai.provider.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.js";
import {
  GUEST_IDENTITY_CONFIG,
  type GuestIdentityConfig,
} from "../src/modules/guest/guest.config.js";
import type { RedisOperation } from "../src/modules/redis/redis.errors.js";
import type { RedisCommandExecutor, RedisEvalOptions } from "../src/modules/redis/redis.types.js";
import { REDIS_COMMAND_EXECUTOR } from "../src/modules/redis/redis.types.js";
import { PrismaService } from "../src/modules/auth/prisma.service.js";
import { QUOTA_ADMISSION_FINGERPRINT_CONFIG } from "../src/modules/usage/quota-admission.config.js";
import {
  USAGE_DEFAULT_DAILY_LIMITS,
  USAGE_DEFAULT_REDIS_CONFIG,
  USAGE_REDIS_CONFIG,
  type UsageRedisConfig,
} from "../src/modules/usage/usage.config.js";

const TEST_GUEST_IDENTITY_SECRET = "guest-identity-fixture-value-0123456789abcdef";
const TEST_QUOTA_FINGERPRINT = "guest-quota-fixture-value-0123456789abcdef";
const source = "const responseMustRemainSourceFree = true;";
const validResult = {
  findings: [],
  schemaVersion: "v1",
  summary: "No actionable findings were detected.",
} as const;
const validUsage = { inputTokens: 6, outputTokens: 7, totalTokens: 13 } as const;

type RedisMode = "allowed" | "denied" | "malformed" | "unavailable";

class GuestQuotaRedisFake implements RedisCommandExecutor {
  mode: RedisMode = "allowed";
  readonly calls: Array<{
    readonly options: RedisEvalOptions;
    readonly operation: RedisOperation;
  }> = [];

  async eval(
    _script: string,
    options: RedisEvalOptions,
    operation: RedisOperation,
  ): Promise<unknown> {
    this.calls.push({ options, operation });

    if (this.mode === "unavailable") {
      throw new Error("private redis runtime value");
    }

    if (this.mode === "malformed") {
      return [1, 1];
    }

    if (this.mode === "denied") {
      return [0, 3, 0, 7_200];
    }

    const limit = Number(options.arguments[0]);
    return [1, 1, limit - 1, 3_600];
  }

  async set(): Promise<"OK" | null> {
    return "OK";
  }
}

function usageRedisConfig(): UsageRedisConfig {
  return {
    authenticatedDailyLimits: { ...USAGE_DEFAULT_DAILY_LIMITS },
    ...USAGE_DEFAULT_REDIS_CONFIG,
  };
}

function createDatabaseSpy(): { readonly calls: string[]; readonly value: PrismaService } {
  const calls: string[] = [];
  const unavailable = (operation: string): never => {
    calls.push(operation);
    throw new Error("database must not be called by guest review");
  };
  const value = {
    get review() {
      return unavailable("review");
    },
    get reviewResult() {
      return unavailable("reviewResult");
    },
    get reviewUsage() {
      return unavailable("reviewUsage");
    },
    get session() {
      return unavailable("session");
    },
    get user() {
      return unavailable("user");
    },
    transaction: async () => unavailable("transaction"),
  } as unknown as PrismaService;

  return { calls, value };
}

describe("guest QUICK review API", () => {
  let app: INestApplication;
  let provider: FakeAiReviewProvider;
  let providerFailure: Error | undefined;
  let redis: GuestQuotaRedisFake;
  let database: { readonly calls: string[]; readonly value: PrismaService };

  before(async () => {
    providerFailure = undefined;
    provider = new FakeAiReviewProvider([
      () => {
        if (providerFailure) {
          throw providerFailure;
        }

        return { output: validResult, usage: validUsage };
      },
    ]);
    redis = new GuestQuotaRedisFake();
    database = createDatabaseSpy();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_REVIEW_PROVIDER)
      .useValue(provider)
      .overrideProvider(GUEST_IDENTITY_CONFIG)
      .useValue({ secret: TEST_GUEST_IDENTITY_SECRET } satisfies GuestIdentityConfig)
      .overrideProvider(REDIS_COMMAND_EXECUTOR)
      .useValue(redis)
      .overrideProvider(USAGE_REDIS_CONFIG)
      .useValue(usageRedisConfig())
      .overrideProvider(QUOTA_ADMISSION_FINGERPRINT_CONFIG)
      .useValue({ fingerprintSecret: TEST_QUOTA_FINGERPRINT })
      .overrideProvider(PrismaService)
      .useValue(database.value)
      .compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  after(async () => {
    await app.close();
  });

  beforeEach(() => {
    providerFailure = undefined;
    provider.requests.length = 0;
    redis.mode = "allowed";
    redis.calls.length = 0;
    database.calls.length = 0;
  });

  function guestRequest(body: Record<string, unknown>) {
    return request(app.getHttpServer()).post("/api/v1/guest/reviews").send(body);
  }

  it("returns a source-free envelope and sends exact QUICK/Luna execution metadata", async () => {
    const response = await guestRequest({ language: "TypeScript", source });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data.result, validResult);
    assert.equal(response.body.data.execution.provider, "luna");
    assert.equal(response.body.data.execution.model, "gpt-5.6-luna");
    assert.equal(response.body.data.execution.reasoningEffort, "low");
    assert.equal(response.body.data.execution.attempts, 1);
    assert.equal(response.body.data.execution.durationMs >= 0, true);
    assert.deepEqual(response.body.data.execution.usage, validUsage);
    assert.equal("source" in response.body.data, false);
    assert.equal(JSON.stringify(response.body).includes(source), false);
    assert.equal(database.calls.length, 0);

    const providerRequest = provider.requests[0];
    assert.ok(providerRequest);
    assert.equal(providerRequest.provider, "luna");
    assert.equal(providerRequest.model, "gpt-5.6-luna");
    assert.equal(providerRequest.reasoningEffort, "low");
    assert.equal(providerRequest.prompt.user.includes(source), true);

    const quotaCall = redis.calls[0];
    assert.ok(quotaCall);
    assert.equal(quotaCall.operation, "quota-reservation");
    assert.match(quotaCall.options.keys[0] ?? "", /^repomentor:quota:guest:/u);
    assert.equal(JSON.stringify(quotaCall).includes(source), false);
  });

  it("does not trust X-Forwarded-For when deriving the stable quota identity", async () => {
    const first = await request(app.getHttpServer())
      .post("/api/v1/guest/reviews")
      .set("X-Forwarded-For", "198.51.100.10")
      .send({ language: "typescript", source: "const first = true;" });
    const firstKey = redis.calls[0]?.options.keys[0];

    redis.calls.length = 0;
    const second = await request(app.getHttpServer())
      .post("/api/v1/guest/reviews")
      .set("X-Forwarded-For", "203.0.113.20")
      .send({ language: "typescript", source: "const second = true;" });
    const secondKey = redis.calls[0]?.options.keys[0];

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(firstKey, secondKey);
    assert.equal(firstKey?.includes("198.51.100.10"), false);
    assert.equal(firstKey?.includes("203.0.113.20"), false);
  });

  it("rejects blank, oversized, invalid, and unknown input with sanitized 400 envelopes", async () => {
    const cases = [
      { language: "typescript", source: "   " },
      { language: "typescript", source: "x".repeat(100_001) },
      { language: "not a language", source: "const valid = true;" },
      { language: "typescript", mode: "DEEP", source: "const valid = true;" },
    ];

    for (const body of cases) {
      const response = await guestRequest(body);

      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "VALIDATION_FAILED");
      assert.equal("data" in response.body, false);
      assert.equal(JSON.stringify(response.body).includes("x".repeat(100)), false);
    }

    assert.equal(provider.requests.length, 0);
    assert.equal(redis.calls.length, 0);
    assert.equal(database.calls.length, 0);
  });

  it("returns bounded Retry-After for a denied guest quota without invoking Luna", async () => {
    redis.mode = "denied";
    const response = await guestRequest({ language: "typescript", source });

    assert.equal(response.status, 429);
    assert.equal(response.headers["retry-after"], "7200");
    assert.equal(response.body.error.code, "RATE_LIMITED");
    assert.equal(JSON.stringify(response.body).includes(source), false);
    assert.equal(provider.requests.length, 0);
    assert.equal(database.calls.length, 0);
  });

  it("maps Redis unavailable and command failures to generic 503 responses", async () => {
    for (const mode of ["unavailable", "malformed"] as const) {
      redis.mode = mode;
      const response = await guestRequest({ language: "typescript", source });

      assert.equal(response.status, 503);
      assert.equal(response.body.error.code, "DEPENDENCY_UNAVAILABLE");
      assert.equal(JSON.stringify(response.body).includes("private redis runtime value"), false);
      assert.equal(JSON.stringify(response.body).includes(source), false);
    }

    assert.equal(provider.requests.length, 0);
    assert.equal(database.calls.length, 0);
  });

  it("maps provider failures to safe generic statuses", async () => {
    const cases = [
      { failure: new Error("private provider runtime value"), status: 503 },
      { failure: new AiProviderError("RATE_LIMITED"), status: 429 },
      { failure: new AiProviderError("TIMEOUT"), status: 504 },
      { failure: new AiProviderError("AUTHENTICATION"), status: 502 },
    ] as const;

    for (const testCase of cases) {
      providerFailure = testCase.failure;
      const response = await guestRequest({ language: "typescript", source });

      assert.equal(response.status, testCase.status);
      assert.equal(
        response.body.error.code,
        testCase.status === 429 ? "RATE_LIMITED" : "DEPENDENCY_UNAVAILABLE",
      );
      assert.equal(JSON.stringify(response.body).includes("private provider runtime value"), false);
      assert.equal(JSON.stringify(response.body).includes(source), false);
      providerFailure = undefined;
    }

    assert.equal(database.calls.length, 0);
  });

  it("documents the public route and envelope in Swagger", async () => {
    const response = await request(app.getHttpServer()).get("/api/docs-json");
    const operation = response.body.paths?.["/api/v1/guest/reviews"]?.post;

    assert.equal(response.status, 200);
    assert.ok(operation);
    assert.match(JSON.stringify(operation.requestBody), /source/u);
    assert.match(JSON.stringify(operation.requestBody), /language/u);
    assert.equal(
      operation.requestBody.content["application/json"].schema.additionalProperties,
      false,
    );
    assert.match(JSON.stringify(operation.responses["200"]), /GuestReviewResponseDto/u);
    assert.equal(JSON.stringify(operation).includes("security"), false);
  });
});
