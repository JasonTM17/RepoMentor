import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ReviewMode } from "../../src/modules/review/review.types.js";
import {
  RedisCommandError,
  RedisConfigurationError,
  RedisInputError,
  RedisUnavailableError,
} from "../../src/modules/redis/redis.errors.js";
import {
  RedisClientAdapter,
  createRedisClientAdapter,
} from "../../src/modules/redis/redis.client.js";
import {
  buildReviewLockKey,
  buildUsageQuotaKey,
  REDIS_KEY_NAMESPACES,
} from "../../src/modules/redis/redis.keys.js";
import {
  acquireReviewLock,
  RELEASE_LOCK_SCRIPT,
  releaseReviewLock,
} from "../../src/modules/redis/redis.lock.js";
import {
  getUtcDayTtlSeconds,
  reserveQuota,
  RESERVE_QUOTA_SCRIPT,
} from "../../src/modules/redis/redis.quota.js";
import {
  parseUsageRedisConfig,
  USAGE_DEFAULT_DAILY_LIMITS,
  USAGE_DEFAULT_REDIS_CONFIG,
  USAGE_REDIS_ENV_NAMES,
  UsageRedisConfigError,
  type UsageRedisConfig,
} from "../../src/modules/usage/usage.config.js";
import type {
  RedisClientLike,
  RedisCommandExecutor,
  RedisEvalOptions,
  RedisSetOptions,
} from "../../src/modules/redis/redis.types.js";

const QUOTA_NOW = new Date("2026-08-06T12:00:00.000Z");

interface StoredValue {
  readonly value: string;
  readonly expiresAtMs: number | null;
}

interface EvalCall {
  readonly script: string;
  readonly options: RedisEvalOptions;
}

class FakeRedisExecutor implements RedisCommandExecutor {
  readonly evalCalls: EvalCall[] = [];
  readonly setCalls: Array<{
    readonly key: string;
    readonly value: string;
    readonly options: RedisSetOptions;
  }> = [];
  private readonly values = new Map<string, StoredValue>();
  private nowMs = 0;

  async eval(script: string, options: RedisEvalOptions): Promise<unknown> {
    this.expireValues();
    this.evalCalls.push({ script, options });

    if (script === RESERVE_QUOTA_SCRIPT) {
      const key = options.keys[0];
      if (key === undefined) {
        throw new Error("missing key");
      }
      const limit = Number(options.arguments[0]);
      const ttlSeconds = Number(options.arguments[1]);
      const current = this.values.get(key);
      const used = current === undefined ? 0 : Number(current.value);

      if (used >= limit) {
        return [
          0,
          used,
          0,
          current === undefined ? ttlSeconds : this.getTtlSeconds(current, ttlSeconds),
        ];
      }

      const nextUsed = used + 1;
      const expiresAtMs = current?.expiresAtMs ?? this.nowMs + ttlSeconds * 1_000;
      this.values.set(key, { value: String(nextUsed), expiresAtMs });

      return [
        1,
        nextUsed,
        Math.max(limit - nextUsed, 0),
        this.getTtlSeconds({ value: String(nextUsed), expiresAtMs }, ttlSeconds),
      ];
    }

    if (script === RELEASE_LOCK_SCRIPT) {
      const key = options.keys[0];
      if (key === undefined) {
        throw new Error("missing key");
      }
      const current = this.values.get(key);

      if (current?.value === options.arguments[0]) {
        this.values.delete(key);
        return 1;
      }

      return 0;
    }

    throw new Error("unexpected script");
  }

  async set(key: string, value: string, options: RedisSetOptions): Promise<"OK" | null> {
    this.expireValues();
    this.setCalls.push({ key, value, options });

    if (options.NX && this.values.has(key)) {
      return null;
    }

    this.values.set(key, {
      value,
      expiresAtMs: this.nowMs + options.PX,
    });
    return "OK";
  }

  advance(milliseconds: number): void {
    this.nowMs += milliseconds;
    this.expireValues();
  }

  valueFor(key: string): string | undefined {
    this.expireValues();
    return this.values.get(key)?.value;
  }

  private expireValues(): void {
    for (const [key, value] of this.values) {
      if (value.expiresAtMs !== null && value.expiresAtMs <= this.nowMs) {
        this.values.delete(key);
      }
    }
  }

  private getTtlSeconds(value: StoredValue, fallback: number): number {
    if (value.expiresAtMs === null) {
      return fallback;
    }

    return Math.max(0, Math.ceil((value.expiresAtMs - this.nowMs) / 1_000));
  }
}

function makeConfig(overrides: Partial<UsageRedisConfig> = {}): UsageRedisConfig {
  return {
    authenticatedDailyLimits: { ...USAGE_DEFAULT_DAILY_LIMITS },
    guestQuickLimit: USAGE_DEFAULT_REDIS_CONFIG.guestQuickLimit,
    quotaTtlMaxSeconds: USAGE_DEFAULT_REDIS_CONFIG.quotaTtlMaxSeconds,
    lockTtlMs: USAGE_DEFAULT_REDIS_CONFIG.lockTtlMs,
    ...overrides,
  };
}

describe("usage Redis configuration", () => {
  it("keeps authenticated defaults and gives guests three quick reviews", () => {
    assert.deepEqual(parseUsageRedisConfig({ NODE_ENV: "test" }), {
      authenticatedDailyLimits: USAGE_DEFAULT_DAILY_LIMITS,
      guestQuickLimit: 3,
      quotaTtlMaxSeconds: 86_400,
      lockTtlMs: 10_000,
    });
  });

  it("accepts bounded overrides and rejects invalid values without echoing them", () => {
    const environment = {
      [USAGE_REDIS_ENV_NAMES.GUEST_QUICK]: "0",
      [USAGE_REDIS_ENV_NAMES.QUOTA_TTL_MAX_SECONDS]: "86400",
      [USAGE_REDIS_ENV_NAMES.LOCK_TTL_MS]: "60000",
    };

    assert.deepEqual(parseUsageRedisConfig(environment), {
      authenticatedDailyLimits: USAGE_DEFAULT_DAILY_LIMITS,
      guestQuickLimit: 0,
      quotaTtlMaxSeconds: 86_400,
      lockTtlMs: 60_000,
    });

    const invalidValues = [
      [USAGE_REDIS_ENV_NAMES.GUEST_QUICK, "100001"],
      [USAGE_REDIS_ENV_NAMES.QUOTA_TTL_MAX_SECONDS, "0"],
      [USAGE_REDIS_ENV_NAMES.LOCK_TTL_MS, "999"],
      [USAGE_REDIS_ENV_NAMES.LOCK_TTL_MS, "60001"],
    ] as const;

    for (const [variableName, invalidValue] of invalidValues) {
      assert.throws(
        () => parseUsageRedisConfig({ [variableName]: invalidValue }),
        (error: unknown) => {
          assert.ok(error instanceof UsageRedisConfigError);
          assert.deepEqual(error.variableNames, [variableName]);
          assert.equal(error.message.includes(invalidValue), false);
          return true;
        },
      );
    }
  });
});

describe("Redis key boundaries", () => {
  it("uses distinct authenticated and guest namespaces with safe components", () => {
    const authenticatedKey = buildUsageQuotaKey("authenticated", "user_123", "2026-08-06", "QUICK");
    const guestKey = buildUsageQuotaKey("guest", "guest_123", "2026-08-06", "QUICK");

    assert.equal(
      authenticatedKey,
      `${REDIS_KEY_NAMESPACES.authenticatedQuota}:user_123:2026-08-06:QUICK`,
    );
    assert.equal(guestKey, `${REDIS_KEY_NAMESPACES.guestQuota}:guest_123:2026-08-06:QUICK`);
    assert.notEqual(authenticatedKey, guestKey);
    assert.equal(authenticatedKey.includes("source"), false);
    assert.equal(authenticatedKey.includes("token"), false);
  });

  it("rejects injected components, non-calendar days, and guest non-quick modes", () => {
    for (const identity of ["user:injected", "user with spaces", ""]) {
      assert.throws(
        () => buildUsageQuotaKey("authenticated", identity, "2026-08-06", "QUICK"),
        RedisInputError,
      );
    }

    for (const utcDay of ["2026-02-30", "2026-8-06", "2026-08-06T00:00:00Z"]) {
      assert.throws(
        () => buildUsageQuotaKey("authenticated", "user_123", utcDay, "QUICK"),
        RedisInputError,
      );
    }

    assert.throws(
      () => buildUsageQuotaKey("guest", "guest_123", "2026-08-06", "STANDARD" as ReviewMode),
      RedisInputError,
    );
    assert.throws(() => buildReviewLockKey("review/id"), RedisInputError);
  });
});

describe("atomic quota reservation", () => {
  it("derives a bounded inclusive-day TTL from UTC time", () => {
    assert.equal(getUtcDayTtlSeconds(new Date("2026-08-06T00:00:00.000Z")), 86_400);
    assert.equal(getUtcDayTtlSeconds(new Date("2026-08-06T23:59:59.999Z")), 1);
    assert.throws(() => getUtcDayTtlSeconds(new Date("invalid")), RedisInputError);
  });

  it("allows, denies without incrementing, and expires a guest quota", async () => {
    const executor = new FakeRedisExecutor();
    const config = makeConfig();
    const input = {
      namespace: "guest" as const,
      identity: "guest_123",
      utcDay: "2026-08-06",
      mode: "QUICK" as const,
      now: QUOTA_NOW,
    };

    const first = await reserveQuota(executor, config, input);
    const second = await reserveQuota(executor, config, input);
    const third = await reserveQuota(executor, config, input);
    const denied = await reserveQuota(executor, config, input);
    const key = buildUsageQuotaKey("guest", "guest_123", "2026-08-06", "QUICK");

    assert.deepEqual(first, {
      allowed: true,
      used: 1,
      remaining: 2,
      retryAfterSeconds: 43_200,
    });
    assert.equal(second.allowed, true);
    assert.equal(third.remaining, 0);
    assert.deepEqual(denied, {
      allowed: false,
      used: 3,
      remaining: 0,
      retryAfterSeconds: 43_200,
    });
    assert.equal(executor.valueFor(key), "3");
    assert.equal(executor.evalCalls.length, 4);
    const firstEvalCall = executor.evalCalls[0];
    assert.ok(firstEvalCall);
    assert.equal(firstEvalCall.script, RESERVE_QUOTA_SCRIPT);
    assert.deepEqual(firstEvalCall.options.keys, [key]);
    assert.deepEqual(firstEvalCall.options.arguments, ["3", "43200"]);

    executor.advance(43_200_000);
    const afterExpiry = await reserveQuota(executor, config, input);
    assert.equal(afterExpiry.used, 1);
    assert.equal(afterExpiry.allowed, true);
  });

  it("preserves authenticated limits and parses Redis string integers", async () => {
    const executor: RedisCommandExecutor = {
      async eval(): Promise<unknown> {
        return ["1", "2", "18", "3600"];
      },
      async set(): Promise<"OK" | null> {
        return "OK";
      },
    };

    const result = await reserveQuota(executor, makeConfig(), {
      namespace: "authenticated",
      identity: "user_123",
      utcDay: "2026-08-06",
      mode: "QUICK",
      now: QUOTA_NOW,
    });

    assert.deepEqual(result, {
      allowed: true,
      used: 2,
      remaining: 18,
      retryAfterSeconds: 3_600,
    });
  });

  it("fails closed on unavailable Redis and malformed results", async () => {
    const unavailable: RedisCommandExecutor = {
      async eval(): Promise<unknown> {
        throw new Error("REDIS_URL=redis://:runtime-only-value@redis.internal");
      },
      async set(): Promise<"OK" | null> {
        return null;
      },
    };

    await assert.rejects(
      reserveQuota(unavailable, makeConfig(), {
        namespace: "guest",
        identity: "guest_123",
        utcDay: "2026-08-06",
        mode: "QUICK",
        now: QUOTA_NOW,
      }),
      (error: unknown) => {
        assert.ok(error instanceof RedisUnavailableError);
        assert.equal(error.message.includes("runtime-only-value"), false);
        return true;
      },
    );

    const malformed: RedisCommandExecutor = {
      async eval(): Promise<unknown> {
        return [1, 1];
      },
      async set(): Promise<"OK" | null> {
        return null;
      },
    };

    await assert.rejects(
      reserveQuota(malformed, makeConfig(), {
        namespace: "guest",
        identity: "guest_123",
        utcDay: "2026-08-06",
        mode: "QUICK",
        now: QUOTA_NOW,
      }),
      RedisCommandError,
    );
  });
});

describe("review request lock", () => {
  it("uses SET NX PX and compare-and-delete ownership", async () => {
    const executor = new FakeRedisExecutor();
    const config = makeConfig();
    const first = await acquireReviewLock(executor, config, {
      reviewId: "review_123",
      token: "owner-token",
      ttlMs: 5_000,
    });
    const contended = await acquireReviewLock(executor, config, {
      reviewId: "review_123",
      token: "other-token",
      ttlMs: 5_000,
    });
    const key = buildReviewLockKey("review_123");

    assert.deepEqual(first, { acquired: true, token: "owner-token" });
    assert.deepEqual(contended, { acquired: false });
    assert.deepEqual(executor.setCalls[0], {
      key,
      value: "owner-token",
      options: { NX: true, PX: 5_000 },
    });
    assert.equal(executor.setCalls[0].key.includes("owner-token"), false);
    assert.equal(await releaseReviewLock(executor, "review_123", "other-token"), false);
    assert.equal(executor.valueFor(key), "owner-token");
    assert.equal(await releaseReviewLock(executor, "review_123", "owner-token"), true);
    assert.equal(executor.valueFor(key), undefined);
    assert.equal(RELEASE_LOCK_SCRIPT.includes("ARGV[1]"), true);
    assert.equal(RELEASE_LOCK_SCRIPT.includes("DEL"), true);
  });

  it("does not reuse an expired owner and enforces token and TTL bounds", async () => {
    const executor = new FakeRedisExecutor();
    const config = makeConfig();
    const acquired = await acquireReviewLock(executor, config, {
      reviewId: "review_expiring",
      tokenFactory: () => "generated-token",
      ttlMs: 1_000,
    });

    assert.equal(acquired.acquired, true);
    assert.equal(acquired.token, "generated-token");
    executor.advance(1_000);

    const afterExpiry = await acquireReviewLock(executor, config, {
      reviewId: "review_expiring",
      token: "new-owner-token",
      ttlMs: 1_000,
    });
    assert.deepEqual(afterExpiry, {
      acquired: true,
      token: "new-owner-token",
    });

    for (const input of [
      { token: "", ttlMs: 1_000 },
      { token: "token with spaces", ttlMs: 1_000 },
      { token: "valid-token", ttlMs: 999 },
      { token: "valid-token", ttlMs: 10_001 },
    ]) {
      await assert.rejects(
        acquireReviewLock(executor, config, {
          reviewId: "review_invalid",
          token: input.token,
          ttlMs: input.ttlMs,
        }),
        RedisInputError,
      );
    }
  });
});

describe("lazy Redis client adapter", () => {
  it("does not construct or connect until the first command", async () => {
    let created = 0;
    let connected = 0;
    const fakeClient: RedisClientLike = {
      isOpen: true,
      async connect(): Promise<void> {
        connected += 1;
      },
      on(): void {
        return undefined;
      },
      async eval(): Promise<unknown> {
        return 1;
      },
      async set(): Promise<"OK" | null> {
        return "OK";
      },
    };
    const adapter = createRedisClientAdapter("redis://localhost:6379", () => {
      created += 1;
      return fakeClient;
    });

    assert.equal(adapter instanceof RedisClientAdapter, true);
    assert.equal(created, 0);
    assert.equal(connected, 0);
    assert.equal(await adapter.eval("return 1", { keys: [], arguments: [] }), 1);
    assert.equal(created, 1);
    assert.equal(connected, 0);
  });

  it("redacts connection failures and rejects non-Redis URLs", async () => {
    assert.throws(
      () => createRedisClientAdapter("https://redis.internal"),
      RedisConfigurationError,
    );

    const adapter = createRedisClientAdapter("rediss://redis.internal:6380", () => ({
      isOpen: false,
      async connect(): Promise<void> {
        throw new Error("redis://:runtime-only-value@redis.internal");
      },
      on(): void {
        return undefined;
      },
      async eval(): Promise<unknown> {
        return null;
      },
      async set(): Promise<"OK" | null> {
        return null;
      },
    }));

    await assert.rejects(
      adapter.set("repomentor:lock:review:review_123", "opaque-token", {
        NX: true,
        PX: 1_000,
      }),
      (error: unknown) => {
        assert.ok(error instanceof RedisUnavailableError);
        assert.equal(error.message.includes("runtime-only-value"), false);
        return true;
      },
    );
  });
});
