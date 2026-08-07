import { createHash, randomBytes } from "node:crypto";

import { REVIEW_MODES, type ReviewMode } from "../review/review.types.js";
import { QuotaAdmissionInputError } from "./quota-admission.errors.js";

export const IDEMPOTENCY_KEY_MIN_LENGTH = 22;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
export const IDEMPOTENCY_KEY_HASH_LENGTH = 64;
export const OPAQUE_ID_MAX_LENGTH = 25;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~-]+$/u;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/u;

/**
 * Idempotency keys are deliberately restricted to a bounded HTTP-token-like
 * shape. The minimum length is a shape/entropy floor, not a proof of entropy.
 * Raw keys never cross the repository boundary or appear in errors.
 */
export function normalizeIdempotencyKey(value: unknown): string {
  if (typeof value !== "string") {
    throw new QuotaAdmissionInputError("idempotencyKey");
  }

  const normalized = value.normalize("NFC");

  if (
    normalized !== value ||
    normalized.length < IDEMPOTENCY_KEY_MIN_LENGTH ||
    normalized.length > IDEMPOTENCY_KEY_MAX_LENGTH ||
    !IDEMPOTENCY_KEY_PATTERN.test(normalized)
  ) {
    throw new QuotaAdmissionInputError("idempotencyKey");
  }

  return normalized;
}

export function hashIdempotencyKey(value: unknown): string {
  const normalized = normalizeIdempotencyKey(value);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function assertIdempotencyKeyHash(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length !== IDEMPOTENCY_KEY_HASH_LENGTH ||
    !/^[a-f0-9]{64}$/u.test(value)
  ) {
    throw new QuotaAdmissionInputError("idempotencyKeyHash");
  }

  return value;
}

export function assertSafeOpaqueId(
  value: unknown,
  field: "admissionId" | "reviewId" | "userId",
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > OPAQUE_ID_MAX_LENGTH ||
    !OPAQUE_ID_PATTERN.test(value)
  ) {
    throw new QuotaAdmissionInputError(field);
  }

  return value;
}

export function createOpaqueAdmissionId(): string {
  return `c${randomBytes(18).toString("base64url")}`;
}

export function assertReviewMode(value: unknown): ReviewMode {
  if (typeof value !== "string" || !(REVIEW_MODES as readonly string[]).includes(value)) {
    throw new QuotaAdmissionInputError("mode");
  }

  return value as ReviewMode;
}
