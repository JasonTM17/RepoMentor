import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMPENSATE_QUOTA_ADMISSION_SCRIPT,
  compensateQuotaAdmission,
  RESERVE_QUOTA_ADMISSION_SCRIPT,
  reserveQuotaAdmission,
  type QuotaAdmissionReservationInput,
} from "../../src/modules/redis/redis.admission.js";
import { RedisCommandError, RedisUnavailableError } from "../../src/modules/redis/redis.errors.js";
import { buildQuotaAdmissionKeys } from "../../src/modules/redis/redis.keys.js";
import {
  USAGE_DEFAULT_DAILY_LIMITS,
  USAGE_DEFAULT_REDIS_CONFIG,
  type UsageRedisConfig,
} from "../../src/modules/usage/usage.config.js";
import type {
  RedisCommandExecutor,
  RedisEvalOptions,
} from "../../src/modules/redis/redis.types.js";

const NOW = new Date("2026-08-06T12:00:00.000Z");

interface StoredValue {
  readonly value: string;
  readonly expiresAtMs: number;
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

class FakeAdmissionExecutor implements RedisCommandExecutor {
  readonly evalCalls: Array<{ readonly script: string; readonly options: RedisEvalOptions }> = [];
  private readonly values = new Map<string, StoredValue>();
  private nowMs = 0;

  async eval(script: string, options: RedisEvalOptions): Promise<unknown> {
    this.expireValues();
    this.evalCalls.push({ options, script });

    const counterKey = options.keys[0];
    const markerKey = options.keys[1];
    const limit = Number(options.arguments[0]);
    const ttlSeconds = Number(options.arguments[1]);
    const admissionId = options.arguments[2];

    if (!counterKey || !markerKey || !admissionId) {
      throw new Error("missing admission arguments");
    }

    if (script === RESERVE_QUOTA_ADMISSION_SCRIPT) {
      const marker = this.values.get(markerKey);

      if (marker) {
        const parsed = this.parseMarker(marker.value);
        return [parsed.outcome, parsed.used, parsed.remaining, parsed.retryAfter, 1];
      }

      const current = this.values.get(counterKey);
      const used = current ? Number(current.value) : 0;
      const currentTtl = current ? this.ttlSeconds(current) : -2;
      let nextUsed = used;
      let outcome = 0;
      let retryAfter = current ? currentTtl : ttlSeconds;

      if (used < limit) {
        nextUsed += 1;
        outcome = 1;
        const expiresAtMs =
          current && currentTtl > 0
            ? current.expiresAtMs
            : this.nowMs + ttlSeconds * 1_000;
        this.values.set(counterKey, { expiresAtMs, value: String(nextUsed) });
        retryAfter = this.ttlSeconds(this.values.get(counterKey)!);
      } else if (current && currentTtl <= 0) {
        const expiresAtMs = this.nowMs + ttlSeconds * 1_000;
        this.values.set(counterKey, { expiresAtMs, value: current.value });
        retryAfter = this.ttlSeconds(this.values.get(counterKey)!);
      }

      const remaining = Math.max(limit - nextUsed, 0);
      this.values.set(markerKey, {
        expiresAtMs: this.nowMs + retryAfter * 1_000,
        value: `${admissionId}|${outcome}|${nextUsed}|${remaining}|${retryAfter}`,
      });
      return [outcome, nextUsed, remaining, retryAfter, 0];
    }

    if (script === COMPENSATE_QUOTA_ADMISSION_SCRIPT) {
      const marker = this.values.get(markerKey);

      if (!marker) {
        return [0, 0, limit, 0];
      }

      const parsed = this.parseMarker(marker.value);

      if (parsed.outcome !== 1) {
        return [0, parsed.used, parsed.remaining, parsed.retryAfter];
      }

      const current = this.values.get(counterKey);
      const nextUsed = current ? Math.max(Number(current.value) - 1, 0) : 0;
      if (current && nextUsed === 0) {
        this.values.delete(counterKey);
      } else if (current) {
        this.values.set(counterKey, { ...current, value: String(nextUsed) });
      }

      const retryAfter = current ? this.ttlSeconds(current) : parsed.retryAfter;
      const remaining = Math.max(limit - nextUsed, 0);
      this.values.set(markerKey, {
        expiresAtMs: marker.expiresAtMs,
        value: `${admissionId}|2|${nextUsed}|${remaining}|${retryAfter}`,
      });
      return [1, nextUsed, remaining, retryAfter];
    }

    throw new Error("unexpected script");
  }

  async set(): Promise<"OK" | null> {
    return "OK";
  }

  advance(milliseconds: number): void {
    this.nowMs += milliseconds;
    this.expireValues();
  }

  private parseMarker(value: string): {
    readonly outcome: number;
    readonly used: number;
    readonly remaining: number;
    readonly retryAfter: number;
  } {
    const match =
      /^(?<owner>[^|]+)\|(?<outcome>[012])\|(?<used>\d+)\|(?<remaining>\d+)\|(?<retry>\d+)$/u.exec(
        value,
      );
    if (!match?.groups) {
      throw new Error("invalid marker");
    }
    return {
      outcome: Number(match.groups.outcome),
      remaining: Number(match.groups.remaining),
      retryAfter: Number(match.groups.retry),
      used: Number(match.groups.used),
    };
  }

  private ttlSeconds(value: StoredValue): number {
    return Math.max(0, Math.floor((value.expiresAtMs - this.nowMs) / 1_000));
  }

  private expireValues(): void {
    for (const [key, value] of this.values) {
      if (value.expiresAtMs <= this.nowMs) {
        this.values.delete(key);
      }
    }
  }
}

function input(admissionId: string): QuotaAdmissionReservationInput {
  return {
    admissionId,
    identity: "user_123",
    mode: "QUICK",
    namespace: "authenticated",
    now: NOW,
    utcDay: "2026-08-06",
  };
}

describe("reservation-aware Redis admission keys", () => {
  it("keeps counter and marker in one cluster slot without raw secrets", () => {
    const keys = buildQuotaAdmissionKeys(
      "authenticated",
      "user_123",
      "2026-08-06",
      "QUICK",
      "admission_123",
    );
    const counterTag = keys.counterKey.match(/\{([^}]+)\}/u)?.[1];
    const markerTag = keys.markerKey.match(/\{([^}]+)\}/u)?.[1];

    assert.equal(counterTag, markerTag);
    assert.equal(keys.counterKey.includes("source"), false);
    assert.equal(keys.markerKey.includes("token"), false);
    assert.equal(keys.markerKey.includes("admission_123"), true);
    assert.throws(() =>
      buildQuotaAdmissionKeys("authenticated", "user:injected", "2026-08-06", "QUICK", "a"),
    );
  });
});

describe("atomic Redis quota admission reservation", () => {
  it("allows, replays the same admission id, and denies another contender at the limit", async () => {
    const executor = new FakeAdmissionExecutor();
    const config = makeConfig({ authenticatedDailyLimits: { DEEP: 3, QUICK: 1, STANDARD: 10 } });

    const first = await reserveQuotaAdmission(executor, config, input("admission_1"));
    const replay = await reserveQuotaAdmission(executor, config, input("admission_1"));
    const denied = await reserveQuotaAdmission(executor, config, input("admission_2"));

    assert.deepEqual(first, {
      allowed: true,
      outcome: "RESERVED",
      remaining: 0,
      replayed: false,
      retryAfterSeconds: 43_200,
      used: 1,
    });
    assert.deepEqual(replay, { ...first, replayed: true });
    assert.deepEqual(denied, {
      allowed: false,
      outcome: "DENIED",
      remaining: 0,
      replayed: false,
      retryAfterSeconds: 43_200,
      used: 1,
    });
    assert.equal(executor.evalCalls.length, 3);
    assert.equal(executor.evalCalls[0]?.script, RESERVE_QUOTA_ADMISSION_SCRIPT);
    assert.deepEqual(executor.evalCalls[0]?.options.arguments, ["1", "43200", "admission_1"]);
  });

  it("refreshes a live counter whose Redis TTL has rounded down to zero", async () => {
    const executor = new FakeAdmissionExecutor();
    const config = makeConfig({ authenticatedDailyLimits: { DEEP: 3, QUICK: 2, STANDARD: 10 } });

    await reserveQuotaAdmission(executor, config, input("admission_1"));
    executor.advance(43_199_500);

    const nearExpiry = await reserveQuotaAdmission(executor, config, input("admission_2"));

    assert.match(RESERVE_QUOTA_ADMISSION_SCRIPT, /currentTtl <= 0/u);
    assert.deepEqual(nearExpiry, {
      allowed: true,
      outcome: "RESERVED",
      remaining: 0,
      replayed: false,
      retryAfterSeconds: 43_200,
      used: 2,
    });
  });

  it("compensates once, keeps a tombstone, and prevents a second reservation", async () => {
    const executor = new FakeAdmissionExecutor();
    const config = makeConfig({ authenticatedDailyLimits: { DEEP: 3, QUICK: 1, STANDARD: 10 } });
    const reservation = input("admission_1");

    await reserveQuotaAdmission(executor, config, reservation);
    const compensated = await compensateQuotaAdmission(executor, config, reservation);
    const repeatedCompensation = await compensateQuotaAdmission(executor, config, reservation);
    const replayAfterCompensation = await reserveQuotaAdmission(executor, config, reservation);
    const nextAdmission = await reserveQuotaAdmission(executor, config, input("admission_2"));

    assert.equal(compensated.compensated, true);
    assert.equal(compensated.used, 0);
    assert.equal(repeatedCompensation.compensated, false);
    assert.equal(replayAfterCompensation.outcome, "COMPENSATED");
    assert.equal(replayAfterCompensation.allowed, false);
    assert.equal(replayAfterCompensation.replayed, true);
    assert.equal(nextAdmission.allowed, true);
  });

  it("expires the counter and marker together", async () => {
    const executor = new FakeAdmissionExecutor();
    const config = makeConfig();
    const reservation = input("admission_1");

    await reserveQuotaAdmission(executor, config, reservation);
    executor.advance(43_200_000);
    const afterExpiry = await reserveQuotaAdmission(executor, config, reservation);

    assert.equal(afterExpiry.outcome, "RESERVED");
    assert.equal(afterExpiry.replayed, false);
  });

  it("fails closed on malformed or unavailable Redis results without leaking details", async () => {
    const malformed: RedisCommandExecutor = {
      async eval(): Promise<unknown> {
        return [1, 1];
      },
      async set(): Promise<"OK" | null> {
        return null;
      },
    };
    await assert.rejects(
      reserveQuotaAdmission(malformed, makeConfig(), input("admission_1")),
      RedisCommandError,
    );
    await assert.rejects(
      compensateQuotaAdmission(malformed, makeConfig(), input("admission_1")),
      RedisCommandError,
    );

    const secret = "runtime-only-secret-value";
    const unavailable: RedisCommandExecutor = {
      async eval(): Promise<unknown> {
        throw new Error(`redis://:${secret}@redis.internal`);
      },
      async set(): Promise<"OK" | null> {
        return null;
      },
    };
    await assert.rejects(
      compensateQuotaAdmission(unavailable, makeConfig(), input("admission_1")),
      (error: unknown) => {
        assert.ok(error instanceof RedisUnavailableError);
        assert.equal(error.operation, "quota-admission-compensation");
        assert.equal(error.message.includes(secret), false);
        return true;
      },
    );
  });
});
