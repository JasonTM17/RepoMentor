import type { ReviewMode } from "../review/review.types.js";
import { USAGE_REDIS_LIMITS, type UsageRedisConfig } from "../usage/usage.config.js";
import { RedisCommandError, RedisInputError, RedisUnavailableError } from "./redis.errors.js";
import {
  buildQuotaAdmissionKeys,
  type RedisQuotaAdmissionKeys,
  type RedisQuotaNamespace,
} from "./redis.keys.js";
import { getUtcDayTtlSeconds } from "./redis.quota.js";
import type { RedisCommandExecutor } from "./redis.types.js";

export const RESERVE_QUOTA_ADMISSION_SCRIPT = `
local marker = redis.call("GET", KEYS[2])
if marker then
  local owner, outcome, used, remaining, retryAfter = string.match(
    marker,
    "^([^|]+)|([012])|(%d+)|(%d+)|(%d+)$"
  )
  if owner ~= ARGV[3] or outcome == nil then
    return redis.error_reply("invalid admission marker")
  end
  return {tonumber(outcome), tonumber(used), tonumber(remaining), tonumber(retryAfter), 1}
end

local current = redis.call("GET", KEYS[1])
local used = tonumber(current) or 0
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local currentTtl = redis.call("TTL", KEYS[1])
local outcome = 0

if used < limit then
  used = redis.call("INCR", KEYS[1])
  outcome = 1
  if used == 1 or currentTtl <= 0 then
    redis.call("EXPIRE", KEYS[1], ttl)
    currentTtl = ttl
  end
elseif currentTtl <= 0 and current ~= false then
  redis.call("EXPIRE", KEYS[1], ttl)
  currentTtl = ttl
end

if currentTtl <= 0 then
  currentTtl = ttl
end

local remaining = limit - used
if remaining < 0 then
  remaining = 0
end

local markerValue = table.concat({ARGV[3], tostring(outcome), tostring(used), tostring(remaining), tostring(currentTtl)}, "|")
redis.call("SET", KEYS[2], markerValue, "EX", currentTtl)
return {outcome, used, remaining, currentTtl, 0}
`.trim();

export const COMPENSATE_QUOTA_ADMISSION_SCRIPT = `
local marker = redis.call("GET", KEYS[2])
if not marker then
  return {0, 0, tonumber(ARGV[1]), 0}
end

local owner, outcome, used, remaining, retryAfter = string.match(
  marker,
  "^([^|]+)|([012])|(%d+)|(%d+)|(%d+)$"
)
if owner ~= ARGV[3] or outcome == nil then
  return redis.error_reply("invalid admission marker")
end

local markerTtl = redis.call("TTL", KEYS[2])
if markerTtl < 1 then
  return {0, tonumber(used), tonumber(remaining), tonumber(retryAfter)}
end

if tonumber(outcome) ~= 1 then
  return {0, tonumber(used), tonumber(remaining), tonumber(retryAfter)}
end

local current = tonumber(redis.call("GET", KEYS[1])) or 0
local nextUsed = current
if current > 0 then
  nextUsed = redis.call("DECR", KEYS[1])
  if nextUsed <= 0 then
    redis.call("DEL", KEYS[1])
    nextUsed = 0
  end
end

local limit = tonumber(ARGV[1])
local nextRemaining = limit - nextUsed
if nextRemaining < 0 then
  nextRemaining = 0
end

local counterTtl = redis.call("TTL", KEYS[1])
if counterTtl < 1 then
  counterTtl = tonumber(retryAfter)
end

local tombstone = table.concat({ARGV[3], "2", tostring(nextUsed), tostring(nextRemaining), tostring(counterTtl)}, "|")
redis.call("SET", KEYS[2], tombstone, "EX", markerTtl)
return {1, nextUsed, nextRemaining, counterTtl}
`.trim();

export type QuotaAdmissionReservationOutcome = "RESERVED" | "DENIED" | "COMPENSATED";

export interface QuotaAdmissionReservationInput {
  readonly namespace: RedisQuotaNamespace;
  /** Server-derived opaque identity; never source, token, cookie, or secret data. */
  readonly identity: string;
  readonly utcDay: string;
  readonly mode: ReviewMode;
  readonly admissionId: string;
  readonly now: Date;
}

export interface QuotaAdmissionReservationResult {
  readonly outcome: QuotaAdmissionReservationOutcome;
  readonly allowed: boolean;
  readonly used: number;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
  readonly replayed: boolean;
}

export interface QuotaAdmissionCompensationResult {
  readonly compensated: boolean;
  readonly used: number;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

interface AdmissionReservationParameters {
  readonly keys: RedisQuotaAdmissionKeys;
  readonly limit: number;
  readonly ttlSeconds: number;
}

function parseRedisInteger(
  value: unknown,
  operation: "quota-admission-reservation" | "quota-admission-compensation",
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "bigint"
        ? Number(value)
        : typeof value === "string" && /^\d+$/u.test(value)
          ? Number(value)
          : Number.NaN;

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new RedisCommandError(operation);
  }

  return parsed;
}

function getAdmissionLimit(
  input: QuotaAdmissionReservationInput,
  config: UsageRedisConfig,
): number {
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

function getAdmissionParameters(
  input: QuotaAdmissionReservationInput,
  config: UsageRedisConfig,
): AdmissionReservationParameters {
  const limit = getAdmissionLimit(input, config);
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

  return {
    keys: buildQuotaAdmissionKeys(
      input.namespace,
      input.identity,
      input.utcDay,
      input.mode,
      input.admissionId,
    ),
    limit,
    ttlSeconds,
  };
}

function mapOutcome(value: number): QuotaAdmissionReservationOutcome {
  if (value === 0) {
    return "DENIED";
  }
  if (value === 1) {
    return "RESERVED";
  }
  if (value === 2) {
    return "COMPENSATED";
  }
  throw new RedisCommandError("quota-admission-reservation");
}

function parseReservationResult(
  rawResult: unknown,
  limit: number,
  maxTtlSeconds: number,
): QuotaAdmissionReservationResult {
  if (!Array.isArray(rawResult) || rawResult.length !== 5) {
    throw new RedisCommandError("quota-admission-reservation");
  }

  const outcomeValue = parseRedisInteger(rawResult[0], "quota-admission-reservation");
  const used = parseRedisInteger(rawResult[1], "quota-admission-reservation");
  const remaining = parseRedisInteger(rawResult[2], "quota-admission-reservation");
  const retryAfterSeconds = parseRedisInteger(rawResult[3], "quota-admission-reservation");
  const replayed = parseRedisInteger(rawResult[4], "quota-admission-reservation");
  const outcome = mapOutcome(outcomeValue);

  if (
    remaining !== Math.max(limit - used, 0) ||
    replayed > 1 ||
    retryAfterSeconds > maxTtlSeconds ||
    (outcome === "RESERVED" && (used === 0 || used > limit)) ||
    (outcome === "DENIED" && used < limit)
  ) {
    throw new RedisCommandError("quota-admission-reservation");
  }

  return {
    allowed: outcome === "RESERVED",
    outcome,
    remaining,
    replayed: replayed === 1,
    retryAfterSeconds,
    used,
  };
}

function parseCompensationResult(
  rawResult: unknown,
  limit: number,
  maxTtlSeconds: number,
): QuotaAdmissionCompensationResult {
  if (!Array.isArray(rawResult) || rawResult.length !== 4) {
    throw new RedisCommandError("quota-admission-compensation");
  }

  const compensated = parseRedisInteger(rawResult[0], "quota-admission-compensation");
  const used = parseRedisInteger(rawResult[1], "quota-admission-compensation");
  const remaining = parseRedisInteger(rawResult[2], "quota-admission-compensation");
  const retryAfterSeconds = parseRedisInteger(rawResult[3], "quota-admission-compensation");

  if (
    compensated > 1 ||
    remaining !== Math.max(limit - used, 0) ||
    retryAfterSeconds > maxTtlSeconds
  ) {
    throw new RedisCommandError("quota-admission-compensation");
  }

  return { compensated: compensated === 1, remaining, retryAfterSeconds, used };
}

/**
 * Reserves one durable admission intent. Duplicate admission ids replay the
 * stored result atomically; no Redis retry is performed by this boundary.
 */
export async function reserveQuotaAdmission(
  executor: RedisCommandExecutor,
  config: UsageRedisConfig,
  input: QuotaAdmissionReservationInput,
): Promise<QuotaAdmissionReservationResult> {
  const parameters = getAdmissionParameters(input, config);
  let rawResult: unknown;

  try {
    rawResult = await executor.eval(
      RESERVE_QUOTA_ADMISSION_SCRIPT,
      {
        arguments: [String(parameters.limit), String(parameters.ttlSeconds), input.admissionId],
        keys: [parameters.keys.counterKey, parameters.keys.markerKey],
      },
      "quota-admission-reservation",
    );
  } catch (error) {
    if (error instanceof RedisUnavailableError) {
      throw error;
    }
    throw new RedisUnavailableError("quota-admission-reservation");
  }

  return parseReservationResult(rawResult, parameters.limit, config.quotaTtlMaxSeconds);
}

/**
 * Compensates only a known, allowed reservation. The marker becomes a
 * tombstone instead of being deleted, so the same admission id cannot reserve
 * a second count. Callers must not invoke this after an indeterminate Redis or
 * PostgreSQL timeout in this foundation slice.
 */
export async function compensateQuotaAdmission(
  executor: RedisCommandExecutor,
  config: UsageRedisConfig,
  input: QuotaAdmissionReservationInput,
): Promise<QuotaAdmissionCompensationResult> {
  const parameters = getAdmissionParameters(input, config);
  let rawResult: unknown;

  try {
    rawResult = await executor.eval(
      COMPENSATE_QUOTA_ADMISSION_SCRIPT,
      {
        arguments: [String(parameters.limit), String(parameters.ttlSeconds), input.admissionId],
        keys: [parameters.keys.counterKey, parameters.keys.markerKey],
      },
      "quota-admission-compensation",
    );
  } catch (error) {
    if (error instanceof RedisUnavailableError) {
      throw error;
    }
    throw new RedisUnavailableError("quota-admission-compensation");
  }

  return parseCompensationResult(rawResult, parameters.limit, config.quotaTtlMaxSeconds);
}
