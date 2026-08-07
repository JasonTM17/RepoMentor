import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ReviewMode } from "../../src/modules/review/review.types.js";
import {
  RedisCommandError,
  RedisConfigurationError,
  RedisInputError,
  RedisUnavailableError,
  type RedisOperation,
} from "../../src/modules/redis/redis.errors.js";
import {
  REDIS_COMMAND_TIMEOUT_MS,
  REDIS_CONNECT_TIMEOUT_MS,
  RedisClientAdapter,
  createRedisClientAdapter,
  getRedisClientOptions,
} from "../../src/modules/redis/redis.client.js";
import {
  buildReviewLockKey,
  buildUsageQuotaKey,
  REDIS_KEY_NAMESPACES,
} from "../../src/modules/redis/redis.keys.js";
import {
  acquireReviewLock,
  RENEW_LOCK_SCRIPT,
  RELEASE_LOCK_SCRIPT,
  releaseReviewLock,
  renewReviewLock,
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
  readonly operation: RedisOperation;
}

class FakeRedisExecutor implements RedisCommandExecutor {
  readonly evalCalls: EvalCall[] = [];
  readonly setCalls: Array<{
    readonly key: string;
    readonly value: string;
    readonly options: RedisSetOptions;
    readonly operation: RedisOperation;
  }> = [];
  private readonly values = new Map<string, StoredValue>();
  private nowMs = 0;

  async eval(
    script: string,
    options: RedisEvalOptions,
    operation: RedisOperation,
  ): Promise<unknown> {
    this.expireValues();
    this.evalCalls.push({ script, options, operation });

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

    if (script === RENEW_LOCK_SCRIPT) {
      const key = options.keys[0];
      const token = options.arguments[0];
      const ttlMs = Number(options.arguments[1]);
      if (key === undefined || token === undefined || !Number.isSafeInteger(ttlMs)) {
        throw new Error("malformed renewal input");
      }

      const current = this.values.get(key);
      if (current?.value !== token) {
        return 0;
      }

      this.values.set(key, {
        value: current.value,
        expiresAtMs: this.nowMs + ttlMs,
      });
      return 1;
    }

    throw new Error("unexpected script");
  }

  async set(
    key: string,
    value: string,
    options: RedisSetOptions,
    operation: RedisOperation,
  ): Promise<"OK" | null> {
    this.expireValues();
    this.setCalls.push({ key, value, options, operation });

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

function unavailableFor(operation: RedisOperation) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof RedisUnavailableError);
    assert.equal(error.operation, operation);
    assert.equal(error.message, "Redis is unavailable.");
    return true;
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
      operation: "lock-acquisition",
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

  it("renews only the current token and resets the lease atomically", async () => {
    const executor = new FakeRedisExecutor();
    const config = makeConfig({ lockTtlMs: 5_000 });
    const acquired = await acquireReviewLock(executor, config, {
      reviewId: "review_renewing",
      token: "owner-token",
      ttlMs: 5_000,
    });
    assert.deepEqual(acquired, { acquired: true, token: "owner-token" });

    executor.advance(4_000);
    assert.equal(
      await renewReviewLock(executor, config, {
        reviewId: "review_renewing",
        token: "owner-token",
      }),
      true,
    );
    assert.equal(executor.evalCalls.at(-1)?.operation, "lock-renewal");
    assert.deepEqual(executor.evalCalls.at(-1)?.options.arguments, ["owner-token", "5000"]);

    executor.advance(4_999);
    assert.equal(executor.valueFor(buildReviewLockKey("review_renewing")), "owner-token");
    assert.equal(
      await renewReviewLock(executor, config, {
        reviewId: "review_renewing",
        token: "wrong-token",
      }),
      false,
    );
    assert.equal(
      await renewReviewLock(executor, config, {
        reviewId: "review_renewing",
        token: "owner-token",
      }),
      true,
    );
  });

  it("returns false after expiry, rejects malformed results, and preserves renewal errors", async () => {
    const executor = new FakeRedisExecutor();
    const config = makeConfig();
    await acquireReviewLock(executor, config, {
      reviewId: "review_expired_renewal",
      token: "owner-token",
    });
    executor.advance(config.lockTtlMs);

    assert.equal(
      await renewReviewLock(executor, config, {
        reviewId: "review_expired_renewal",
        token: "owner-token",
      }),
      false,
    );

    const malformed: RedisCommandExecutor = {
      async eval(): Promise<unknown> {
        return "not-a-lock-result";
      },
      async set(): Promise<"OK" | null> {
        return "OK";
      },
    };
    await assert.rejects(
      renewReviewLock(malformed, config, {
        reviewId: "review_malformed_renewal",
        token: "owner-token",
      }),
      (error: unknown) => {
        assert.ok(error instanceof RedisCommandError);
        assert.equal(error.operation, "lock-renewal");
        return true;
      },
    );

    const unavailable: RedisCommandExecutor = {
      async eval(): Promise<unknown> {
        throw new Error("renewal unavailable");
      },
      async set(): Promise<"OK" | null> {
        return "OK";
      },
    };
    await assert.rejects(
      renewReviewLock(unavailable, config, {
        reviewId: "review_unavailable_renewal",
        token: "owner-token",
      }),
      unavailableFor("lock-renewal"),
    );
  });
});

describe("lazy Redis client adapter", () => {
  it("configures node-redis for no offline queue and no reconnect", () => {
    assert.deepEqual(getRedisClientOptions("rediss://redis.internal:6380"), {
      url: "rediss://redis.internal:6380",
      disableOfflineQueue: true,
      socket: {
        reconnectStrategy: false,
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      },
    });
    assert.equal(REDIS_COMMAND_TIMEOUT_MS, 1_000);
  });

  it("does not construct or connect until the first command", async () => {
    let created = 0;
    let connected = 0;
    const fakeClient: RedisClientLike = {
      isOpen: true,
      isReady: true,
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
    assert.equal(
      await adapter.eval("return 1", { keys: [], arguments: [] }, "quota-reservation"),
      1,
    );
    assert.equal(created, 1);
    assert.equal(connected, 0);
  });

  it("rejects an open but not-ready client without issuing eval or set", async () => {
    let connectCalls = 0;
    let evalCalls = 0;
    let setCalls = 0;
    const adapter = createRedisClientAdapter("redis://localhost:6379", () => ({
      isOpen: true,
      isReady: false,
      async connect(): Promise<void> {
        connectCalls += 1;
      },
      on(): void {
        return undefined;
      },
      async eval(): Promise<unknown> {
        evalCalls += 1;
        return 1;
      },
      async set(): Promise<"OK" | null> {
        setCalls += 1;
        return "OK";
      },
    }));

    await assert.rejects(
      adapter.eval("return 1", { keys: [], arguments: [] }, "quota-reservation"),
      unavailableFor("quota-reservation"),
    );
    await assert.rejects(
      adapter.set(
        "repomentor:lock:review:review_123",
        "opaque-token",
        { NX: true, PX: 1_000 },
        "lock-acquisition",
      ),
      unavailableFor("lock-acquisition"),
    );

    assert.equal(connectCalls, 0);
    assert.equal(evalCalls, 0);
    assert.equal(setCalls, 0);
  });

  it("bounds a connection that never resolves and never issues eval", async () => {
    let connectCalls = 0;
    let evalCalls = 0;
    const adapter = createRedisClientAdapter("redis://localhost:6379", () => ({
      isOpen: false,
      isReady: false,
      connect(): Promise<void> {
        connectCalls += 1;
        return new Promise<void>(() => undefined);
      },
      on(): void {
        return undefined;
      },
      async eval(): Promise<unknown> {
        evalCalls += 1;
        return 1;
      },
      async set(): Promise<"OK" | null> {
        return "OK";
      },
    }));

    await assert.rejects(
      adapter.eval("return 1", { keys: [], arguments: [] }, "quota-reservation"),
      unavailableFor("quota-reservation"),
    );

    assert.equal(connectCalls, 1);
    assert.equal(evalCalls, 0);
  });

  it("bounds one command that never resolves without replaying a quota reservation", async () => {
    let evalCalls = 0;
    let resolveCommand: (value: unknown) => void = () => undefined;
    const pendingCommand = new Promise<unknown>((resolve) => {
      resolveCommand = resolve;
    });
    const adapter = createRedisClientAdapter("redis://localhost:6379", () => ({
      isOpen: true,
      isReady: true,
      async connect(): Promise<void> {
        return undefined;
      },
      on(): void {
        return undefined;
      },
      async eval(): Promise<unknown> {
        evalCalls += 1;
        return pendingCommand;
      },
      async set(): Promise<"OK" | null> {
        return "OK";
      },
    }));

    await assert.rejects(
      reserveQuota(adapter, makeConfig(), {
        namespace: "guest",
        identity: "guest_123",
        utcDay: "2026-08-06",
        mode: "QUICK",
        now: QUOTA_NOW,
      }),
      unavailableFor("quota-reservation"),
    );

    assert.equal(evalCalls, 1);
    resolveCommand([1, 1, 2, 1]);
  });

  it("preserves operation context for quota and lock unavailable paths", async () => {
    const unavailableAdapter = () =>
      createRedisClientAdapter("redis://localhost:6379", () => ({
        isOpen: true,
        isReady: false,
        async connect(): Promise<void> {
          return undefined;
        },
        on(): void {
          return undefined;
        },
        async eval(): Promise<unknown> {
          throw new Error("must not issue command");
        },
        async set(): Promise<"OK" | null> {
          throw new Error("must not issue command");
        },
      }));

    await assert.rejects(
      reserveQuota(unavailableAdapter(), makeConfig(), {
        namespace: "guest",
        identity: "guest_123",
        utcDay: "2026-08-06",
        mode: "QUICK",
        now: QUOTA_NOW,
      }),
      unavailableFor("quota-reservation"),
    );
    await assert.rejects(
      acquireReviewLock(unavailableAdapter(), makeConfig(), {
        reviewId: "review_123",
        token: "owner-token",
      }),
      unavailableFor("lock-acquisition"),
    );
    await assert.rejects(
      releaseReviewLock(unavailableAdapter(), "review_123", "owner-token"),
      unavailableFor("lock-release"),
    );
  });

  it("redacts connection failures and rejects non-Redis URLs", async () => {
    assert.throws(
      () => createRedisClientAdapter("https://redis.internal"),
      RedisConfigurationError,
    );

    const adapter = createRedisClientAdapter("rediss://redis.internal:6380", () => ({
      isOpen: false,
      isReady: false,
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
      adapter.set(
        "repomentor:lock:review:review_123",
        "opaque-token",
        {
          NX: true,
          PX: 1_000,
        },
        "lock-acquisition",
      ),
      (error: unknown) => {
        assert.ok(error instanceof RedisUnavailableError);
        assert.equal(error.message.includes("runtime-only-value"), false);
        assert.equal(error.operation, "lock-acquisition");
        return true;
      },
    );
  });
});
