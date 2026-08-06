import type { ReviewMode } from "../review/review.types.js";
import { USAGE_REDIS_LIMITS, type UsageRedisConfig } from "../usage/usage.config.js";
import { RedisCommandError, RedisInputError, RedisUnavailableError } from "./redis.errors.js";
import { buildUsageQuotaKey, type RedisQuotaNamespace } from "./redis.keys.js";
import type { RedisCommandExecutor } from "./redis.types.js";

export const RESERVE_QUOTA_SCRIPT = `
local current = redis.call("GET", KEYS[1])
local used = tonumber(current) or 0
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local currentTtl = redis.call("TTL", KEYS[1])

if used >= limit then
  if currentTtl < 0 then
    redis.call("EXPIRE", KEYS[1], ttl)
    currentTtl = ttl
  end
  return {0, used, 0, currentTtl}
end

used = redis.call("INCR", KEYS[1])
if used == 1 or currentTtl < 0 then
  redis.call("EXPIRE", KEYS[1], ttl)
  currentTtl = ttl
end

local remaining = limit - used
if remaining < 0 then
  remaining = 0
end

return {1, used, remaining, currentTtl}
`.trim();

export interface QuotaReservationInput {
  readonly namespace: RedisQuotaNamespace;
  /** A server-derived opaque identity; never source, token, cookie, or secret data. */
  readonly identity: string;
  readonly utcDay: string;
  readonly mode: ReviewMode;
  readonly now: Date;
}

export interface QuotaReservationResult {
  readonly allowed: boolean;
  readonly used: number;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

function parseRedisInteger(value: unknown, operation: "quota-reservation"): number {
  let parsed: number;

  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "bigint") {
    parsed = Number(value);
  } else if (typeof value === "string" && /^\d+$/u.test(value)) {
    parsed = Number(value);
  } else {
    throw new RedisCommandError(operation);
  }

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new RedisCommandError(operation);
  }

  return parsed;
}

function getLimit(input: QuotaReservationInput, config: UsageRedisConfig): number {
  if (input.namespace === "guest") {
    if (input.mode !== "QUICK") {
      throw new RedisInputError("guestMode");
    }

    return config.guestQuickLimit;
  }

  if (input.namespace !== "authenticated") {
    throw new RedisInputError("namespace");
  }

  return config.authenticatedDailyLimits[input.mode];
}

export function getUtcDayTtlSeconds(now: Date): number {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new RedisInputError("now");
  }

  const nextUtcDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  const ttlSeconds = Math.ceil((nextUtcDay.getTime() - now.getTime()) / 1_000);

  if (
    ttlSeconds < USAGE_REDIS_LIMITS.minQuotaTtlSeconds ||
    ttlSeconds > USAGE_REDIS_LIMITS.maxQuotaTtlSeconds
  ) {
    throw new RedisInputError("now");
  }

  return ttlSeconds;
}

function assertQuotaInput(
  input: QuotaReservationInput,
  config: UsageRedisConfig,
): { readonly limit: number; readonly ttlSeconds: number } {
  const limit = getLimit(input, config);
  const ttlSeconds = getUtcDayTtlSeconds(input.now);

  if (input.utcDay !== input.now.toISOString().slice(0, 10)) {
    throw new RedisInputError("utcDay");
  }

  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 100_000) {
    throw new RedisInputError("limit");
  }

  if (
    !Number.isSafeInteger(config.quotaTtlMaxSeconds) ||
    config.quotaTtlMaxSeconds < USAGE_REDIS_LIMITS.minQuotaTtlSeconds ||
    config.quotaTtlMaxSeconds > USAGE_REDIS_LIMITS.maxQuotaTtlSeconds
  ) {
    throw new RedisInputError("quotaTtlMaxSeconds");
  }

  if (ttlSeconds > config.quotaTtlMaxSeconds) {
    throw new RedisInputError("now");
  }

  return { limit, ttlSeconds };
}

/**
 * This is the Redis enforcement primitive only. PostgreSQL remains durable
 * usage truth; the next integration slice will connect this boundary to the
 * authenticated review flow and guest no-history behavior.
 */
export async function reserveQuota(
  executor: RedisCommandExecutor,
  config: UsageRedisConfig,
  input: QuotaReservationInput,
): Promise<QuotaReservationResult> {
  const { limit, ttlSeconds } = assertQuotaInput(input, config);

  const key = buildUsageQuotaKey(input.namespace, input.identity, input.utcDay, input.mode);
  let rawResult: unknown;

  try {
    rawResult = await executor.eval(RESERVE_QUOTA_SCRIPT, {
      keys: [key],
      arguments: [String(limit), String(ttlSeconds)],
    });
  } catch (error) {
    if (error instanceof RedisUnavailableError) {
      throw error;
    }

    throw new RedisUnavailableError("quota-reservation");
  }

  if (!Array.isArray(rawResult) || rawResult.length !== 4) {
    throw new RedisCommandError("quota-reservation");
  }

  const allowedValue = parseRedisInteger(rawResult[0], "quota-reservation");
  const used = parseRedisInteger(rawResult[1], "quota-reservation");
  const remaining = parseRedisInteger(rawResult[2], "quota-reservation");
  const retryAfterSeconds = parseRedisInteger(rawResult[3], "quota-reservation");
  const expectedRemaining = Math.max(limit - used, 0);

  if (
    (allowedValue !== 0 && allowedValue !== 1) ||
    remaining !== expectedRemaining ||
    (allowedValue === 1 && (used === 0 || used > limit)) ||
    (allowedValue === 0 && used < limit) ||
    retryAfterSeconds > config.quotaTtlMaxSeconds
  ) {
    throw new RedisCommandError("quota-reservation");
  }

  return {
    allowed: allowedValue === 1,
    used,
    remaining,
    retryAfterSeconds,
  };
}
