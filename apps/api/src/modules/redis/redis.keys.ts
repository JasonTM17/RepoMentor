import { REVIEW_MODES, type ReviewMode } from "../review/review.types.js";
import { RedisInputError } from "./redis.errors.js";

export const REDIS_MAX_KEY_LENGTH = 256;
export const REDIS_MAX_KEY_COMPONENT_LENGTH = 128;
export const REDIS_MAX_LOCK_TOKEN_LENGTH = 128;

export const REDIS_KEY_NAMESPACES = {
  admissionQuota: "repomentor:quota-admission",
  authenticatedQuota: "repomentor:quota:authenticated",
  guestQuota: "repomentor:quota:guest",
  reviewLock: "repomentor:lock:review",
} as const;

export type RedisQuotaNamespace = "authenticated" | "guest";

export interface RedisQuotaAdmissionKeys {
  readonly counterKey: string;
  readonly markerKey: string;
}

const SAFE_KEY_COMPONENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/u;

function assertKeyComponent(field: string, value: string): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > REDIS_MAX_KEY_COMPONENT_LENGTH ||
    !SAFE_KEY_COMPONENT.test(value)
  ) {
    throw new RedisInputError(field);
  }
}

function assertUtcDay(value: string): void {
  if (!UTC_DAY.test(value)) {
    throw new RedisInputError("utcDay");
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new RedisInputError("utcDay");
  }
}

function assertKeyLength(key: string): string {
  if (key.length > REDIS_MAX_KEY_LENGTH) {
    throw new RedisInputError("key");
  }

  return key;
}

export function buildUsageQuotaKey(
  namespace: RedisQuotaNamespace,
  identity: string,
  utcDay: string,
  mode: ReviewMode,
): string {
  const prefix =
    namespace === "authenticated"
      ? REDIS_KEY_NAMESPACES.authenticatedQuota
      : namespace === "guest"
        ? REDIS_KEY_NAMESPACES.guestQuota
        : undefined;

  if (prefix === undefined) {
    throw new RedisInputError("namespace");
  }

  assertKeyComponent("identity", identity);
  assertUtcDay(utcDay);

  if (!REVIEW_MODES.includes(mode)) {
    throw new RedisInputError("mode");
  }

  if (namespace === "guest" && mode !== "QUICK") {
    throw new RedisInputError("guestMode");
  }

  return assertKeyLength([prefix, identity, utcDay, mode].join(":"));
}

export function buildReviewLockKey(reviewId: string): string {
  assertKeyComponent("reviewId", reviewId);
  return assertKeyLength([REDIS_KEY_NAMESPACES.reviewLock, reviewId].join(":"));
}

/**
 * Both keys use the same Redis Cluster hash tag. The admission marker is
 * scoped by the opaque admission id and never contains source or credentials.
 */
export function buildQuotaAdmissionKeys(
  namespace: RedisQuotaNamespace,
  identity: string,
  utcDay: string,
  mode: ReviewMode,
  admissionId: string,
): RedisQuotaAdmissionKeys {
  // Reuse the existing validator for namespace, identity, day, mode, and guest mode.
  buildUsageQuotaKey(namespace, identity, utcDay, mode);
  assertKeyComponent("admissionId", admissionId);

  const hashTag = `{${namespace}:${identity}:${utcDay}:${mode}}`;

  return {
    counterKey: assertKeyLength(
      [REDIS_KEY_NAMESPACES.admissionQuota, hashTag, "counter"].join(":"),
    ),
    markerKey: assertKeyLength(
      [REDIS_KEY_NAMESPACES.admissionQuota, hashTag, "admission", admissionId].join(":"),
    ),
  };
}
