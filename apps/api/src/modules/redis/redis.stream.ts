import { randomBytes } from "node:crypto";

import { RedisCommandError, RedisInputError, RedisUnavailableError } from "./redis.errors.js";
import { buildReviewStreamKey, REDIS_MAX_LOCK_TOKEN_LENGTH } from "./redis.keys.js";
import type { RedisCommandExecutor } from "./redis.types.js";

export const RELEASE_REVIEW_STREAM_LEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`.trim();

const SAFE_STREAM_TOKEN = /^[A-Za-z0-9._~-]+$/u;
const MIN_STREAM_LEASE_TTL_MS = 1_000;
const MAX_STREAM_LEASE_TTL_MS = 300_000;

export interface AcquireReviewStreamLeaseInput {
  readonly reviewId: string;
  readonly ttlMs: number;
  readonly token?: string;
  readonly tokenFactory?: () => string;
}

export interface ReviewStreamLeaseResult {
  readonly acquired: boolean;
  readonly token?: string;
}

function assertTtl(ttlMs: number): void {
  if (
    !Number.isSafeInteger(ttlMs) ||
    ttlMs < MIN_STREAM_LEASE_TTL_MS ||
    ttlMs > MAX_STREAM_LEASE_TTL_MS
  ) {
    throw new RedisInputError("streamLeaseTtlMs");
  }
}

function assertToken(token: string): void {
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > REDIS_MAX_LOCK_TOKEN_LENGTH ||
    !SAFE_STREAM_TOKEN.test(token)
  ) {
    throw new RedisInputError("streamLeaseToken");
  }
}

function createStreamLeaseToken(): string {
  return randomBytes(32).toString("base64url");
}

function parseReleaseResult(value: unknown): 0 | 1 {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "bigint"
        ? Number(value)
        : typeof value === "string" && /^\d+$/u.test(value)
          ? Number(value)
          : Number.NaN;

  if (parsed !== 0 && parsed !== 1) {
    throw new RedisCommandError("stream-release");
  }

  return parsed;
}

export async function acquireReviewStreamLease(
  executor: RedisCommandExecutor,
  input: AcquireReviewStreamLeaseInput,
): Promise<ReviewStreamLeaseResult> {
  const key = buildReviewStreamKey(input.reviewId);
  assertTtl(input.ttlMs);

  let token: string;

  try {
    token = input.token ?? input.tokenFactory?.() ?? createStreamLeaseToken();
  } catch {
    throw new RedisInputError("streamLeaseToken");
  }

  assertToken(token);

  let result: "OK" | null;

  try {
    result = await executor.set(key, token, { NX: true, PX: input.ttlMs }, "stream-acquisition");
  } catch (error) {
    if (error instanceof RedisUnavailableError) {
      throw error;
    }

    throw new RedisUnavailableError("stream-acquisition");
  }

  if (result === null) {
    return { acquired: false };
  }

  if (result !== "OK") {
    throw new RedisCommandError("stream-acquisition");
  }

  return { acquired: true, token };
}

export async function releaseReviewStreamLease(
  executor: RedisCommandExecutor,
  reviewId: string,
  token: string,
): Promise<boolean> {
  const key = buildReviewStreamKey(reviewId);
  assertToken(token);

  let result: unknown;

  try {
    result = await executor.eval(
      RELEASE_REVIEW_STREAM_LEASE_SCRIPT,
      { keys: [key], arguments: [token] },
      "stream-release",
    );
  } catch (error) {
    if (error instanceof RedisUnavailableError) {
      throw error;
    }

    throw new RedisUnavailableError("stream-release");
  }

  return parseReleaseResult(result) === 1;
}
