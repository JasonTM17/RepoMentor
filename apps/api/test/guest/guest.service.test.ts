import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AiReviewService } from "../../src/modules/ai/ai-review.service.js";
import type { AiReviewExecution, AiReviewRequest } from "../../src/modules/ai/ai.types.js";
import type { ReviewResult } from "../../src/modules/ai/review-result.schema.js";
import {
  GuestReviewRateLimitError,
  GuestReviewUnavailableError,
} from "../../src/modules/guest/guest.errors.js";
import { GuestReviewService } from "../../src/modules/guest/guest.service.js";
import type { RedisOperation } from "../../src/modules/redis/redis.errors.js";
import type {
  RedisCommandExecutor,
  RedisEvalOptions,
} from "../../src/modules/redis/redis.types.js";
import {
  USAGE_DEFAULT_DAILY_LIMITS,
  USAGE_DEFAULT_REDIS_CONFIG,
  type UsageRedisConfig,
} from "../../src/modules/usage/usage.config.js";

const validSecret = "guest-identity-fixture-value-0123456789abcdef";
const now = new Date("2026-08-07T12:00:00.000Z");
const source = "const privateValue = 42;";
const validResult: ReviewResult = {
  findings: [],
  schemaVersion: "v1",
  summary: "No actionable findings were detected.",
};
const validExecution: AiReviewExecution<ReviewResult> = {
  attempts: 1,
  durationMs: 7,
  model: "gpt-5.6-luna",
  provider: "luna",
  reasoningEffort: "low",
  result: validResult,
  usage: { inputTokens: 4, outputTokens: 5, totalTokens: 9 },
};

function redisConfig(): UsageRedisConfig {
  return {
    authenticatedDailyLimits: { ...USAGE_DEFAULT_DAILY_LIMITS },
    ...USAGE_DEFAULT_REDIS_CONFIG,
  };
}

class FakeGuestRedisExecutor implements RedisCommandExecutor {
  result: unknown = [1, 1, 2, 3_600];
  failure: Error | undefined;
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

    if (this.failure) {
      throw this.failure;
    }

    return this.result;
  }

  async set(): Promise<"OK" | null> {
    return "OK";
  }
}

interface GuestServiceFixture {
  readonly aiRequests: AiReviewRequest[];
  readonly redis: FakeGuestRedisExecutor;
  readonly service: GuestReviewService;
}

function createFixture(): GuestServiceFixture {
  const redis = new FakeGuestRedisExecutor();
  const aiRequests: AiReviewRequest[] = [];
  const fakeAiReviewService = {
    async review(input: AiReviewRequest): Promise<AiReviewExecution<ReviewResult>> {
      aiRequests.push(input);
      return validExecution;
    },
  } as unknown as AiReviewService;

  return {
    aiRequests,
    redis,
    service: new GuestReviewService(fakeAiReviewService, redis, redisConfig(), {
      secret: validSecret,
    }),
  };
}

describe("guest review service", () => {
  it("reserves guest quota and sends exactly a server-controlled QUICK Luna request", async () => {
    const fixture = createFixture();

    const response = await fixture.service.review(
      { language: "typescript", source },
      "192.0.2.10",
      now,
    );

    assert.deepEqual(fixture.aiRequests, [{ language: "typescript", mode: "QUICK", source }]);
    assert.equal(fixture.redis.calls[0]?.operation, "quota-reservation");
    assert.equal(fixture.redis.calls[0]?.options.keys[0]?.includes("192.0.2.10"), false);
    assert.equal(JSON.stringify(response).includes(source), false);
    assert.deepEqual(response, {
      execution: {
        attempts: 1,
        durationMs: 7,
        model: "gpt-5.6-luna",
        provider: "luna",
        reasoningEffort: "low",
        usage: { inputTokens: 4, outputTokens: 5, totalTokens: 9 },
      },
      result: validResult,
    });
  });

  it("denies quota without invoking Luna and preserves a bounded retry delay", async () => {
    const fixture = createFixture();
    fixture.redis.result = [0, 3, 0, 0];

    await assert.rejects(
      fixture.service.review({ language: "typescript", source }, "192.0.2.10", now),
      (error: unknown) => {
        assert.ok(error instanceof GuestReviewRateLimitError);
        assert.equal(error.retryAfterSeconds, 1);
        return true;
      },
    );
    assert.equal(fixture.aiRequests.length, 0);
  });

  it("maps Redis unavailable and command failures to one safe dependency error", async () => {
    const unavailable = createFixture();
    unavailable.redis.failure = new Error("private redis runtime value");

    await assert.rejects(
      unavailable.service.review({ language: "typescript", source }, "192.0.2.10", now),
      (error: unknown) => {
        assert.ok(error instanceof GuestReviewUnavailableError);
        assert.equal(error.message.includes("private redis runtime value"), false);
        return true;
      },
    );

    const malformed = createFixture();
    malformed.redis.result = [1, 1];

    await assert.rejects(
      malformed.service.review({ language: "typescript", source }, "192.0.2.10", now),
      GuestReviewUnavailableError,
    );
    assert.equal(unavailable.aiRequests.length, 0);
    assert.equal(malformed.aiRequests.length, 0);
  });

  it("fails closed before Redis when the socket address or secret is unavailable", async () => {
    const missingAddress = createFixture();
    await assert.rejects(
      missingAddress.service.review({ language: "typescript", source }, undefined, now),
      GuestReviewUnavailableError,
    );
    assert.equal(missingAddress.redis.calls.length, 0);

    const missingSecret = createFixture();
    const service = new GuestReviewService(
      {
        review: async () => validExecution,
      } as unknown as AiReviewService,
      missingSecret.redis,
      redisConfig(),
      { secret: undefined },
    );
    await assert.rejects(
      service.review({ language: "typescript", source }, "192.0.2.10", now),
      GuestReviewUnavailableError,
    );
    assert.equal(missingSecret.redis.calls.length, 0);
  });
});
