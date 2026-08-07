import { randomBytes } from "node:crypto";

import { USAGE_REDIS_LIMITS, type UsageRedisConfig } from "../usage/usage.config.js";
import { RedisCommandError, RedisInputError, RedisUnavailableError } from "./redis.errors.js";
import { buildReviewLockKey, REDIS_MAX_LOCK_TOKEN_LENGTH } from "./redis.keys.js";
import type { RedisCommandExecutor } from "./redis.types.js";

export const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`.trim();

export const RENEW_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`.trim();

const SAFE_LOCK_TOKEN = /^[A-Za-z0-9._~-]+$/u;

export interface AcquireReviewLockInput {
  readonly reviewId: string;
  readonly ttlMs?: number;
  readonly token?: string;
  readonly tokenFactory?: () => string;
}

export interface ReviewLockResult {
  readonly acquired: boolean;
  readonly token?: string;
}

export interface RenewReviewLockInput {
  readonly reviewId: string;
  readonly token: string;
  readonly ttlMs?: number;
}

function assertLockToken(token: string): void {
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > REDIS_MAX_LOCK_TOKEN_LENGTH ||
    !SAFE_LOCK_TOKEN.test(token)
  ) {
    throw new RedisInputError("lockToken");
  }
}

function assertLockTtl(config: UsageRedisConfig, ttlMs: number): void {
  if (
    !Number.isSafeInteger(config.lockTtlMs) ||
    config.lockTtlMs < USAGE_REDIS_LIMITS.minLockTtlMs ||
    config.lockTtlMs > USAGE_REDIS_LIMITS.maxLockTtlMs
  ) {
    throw new RedisInputError("lockTtlMs");
  }

  if (
    !Number.isSafeInteger(ttlMs) ||
    ttlMs < USAGE_REDIS_LIMITS.minLockTtlMs ||
    ttlMs > config.lockTtlMs
  ) {
    throw new RedisInputError("ttlMs");
  }
}

export function createOpaqueLockToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function acquireReviewLock(
  executor: RedisCommandExecutor,
  config: UsageRedisConfig,
  input: AcquireReviewLockInput,
): Promise<ReviewLockResult> {
  const key = buildReviewLockKey(input.reviewId);
  const ttlMs = input.ttlMs ?? config.lockTtlMs;
  assertLockTtl(config, ttlMs);

  let token: string;

  try {
    token = input.token ?? input.tokenFactory?.() ?? createOpaqueLockToken();
  } catch {
    throw new RedisInputError("lockToken");
  }

  assertLockToken(token);

  let result: "OK" | null;

  try {
    result = await executor.set(key, token, { NX: true, PX: ttlMs }, "lock-acquisition");
  } catch (error) {
    if (error instanceof RedisUnavailableError) {
      throw error;
    }

    throw new RedisUnavailableError("lock-acquisition");
  }

  if (result === null) {
    return { acquired: false };
  }

  if (result !== "OK") {
    throw new RedisCommandError("lock-acquisition");
  }

  return { acquired: true, token };
}

function parseLockResult(value: unknown, operation: "lock-release" | "lock-renewal"): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "bigint"
        ? Number(value)
        : typeof value === "string" && /^\d+$/u.test(value)
          ? Number(value)
          : Number.NaN;

  if (!Number.isSafeInteger(parsed) || (parsed !== 0 && parsed !== 1)) {
    throw new RedisCommandError(operation);
  }

  return parsed;
}

export async function renewReviewLock(
  executor: RedisCommandExecutor,
  config: UsageRedisConfig,
  input: RenewReviewLockInput,
): Promise<boolean> {
  const key = buildReviewLockKey(input.reviewId);
  const ttlMs = input.ttlMs ?? config.lockTtlMs;
  assertLockTtl(config, ttlMs);
  assertLockToken(input.token);

  let rawResult: unknown;

  try {
    rawResult = await executor.eval(
      RENEW_LOCK_SCRIPT,
      {
        keys: [key],
        arguments: [input.token, String(ttlMs)],
      },
      "lock-renewal",
    );
  } catch (error) {
    if (error instanceof RedisUnavailableError) {
      throw error;
    }

    throw new RedisUnavailableError("lock-renewal");
  }

  return parseLockResult(rawResult, "lock-renewal") === 1;
}

export async function releaseReviewLock(
  executor: RedisCommandExecutor,
  reviewId: string,
  token: string,
): Promise<boolean> {
  const key = buildReviewLockKey(reviewId);
  assertLockToken(token);

  let rawResult: unknown;

  try {
    rawResult = await executor.eval(
      RELEASE_LOCK_SCRIPT,
      {
        keys: [key],
        arguments: [token],
      },
      "lock-release",
    );
  } catch (error) {
    if (error instanceof RedisUnavailableError) {
      throw error;
    }

    throw new RedisUnavailableError("lock-release");
  }

  return parseLockResult(rawResult, "lock-release") === 1;
}
