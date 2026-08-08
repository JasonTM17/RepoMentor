import { createHmac } from "node:crypto";

import {
  REVIEW_LEARNER_LEVELS,
  REVIEW_MAX_CONTEXT_LENGTH,
  REVIEW_MAX_LANGUAGE_LENGTH,
  REVIEW_MAX_SOURCE_LENGTH,
  REVIEW_MAX_TITLE_LENGTH,
  REVIEW_MODES,
  type ReviewLearnerLevel,
  type ReviewMode,
} from "../review/review.types.js";

export const QUOTA_ADMISSION_FINGERPRINT_VERSION = 2 as const;
export const QUOTA_ADMISSION_FINGERPRINT_DOMAIN =
  "repomentor:usage:quota-admission:fingerprint" as const;
export const QUOTA_ADMISSION_FINGERPRINT_MIN_SECRET_BYTES = 32;
export const QUOTA_ADMISSION_FINGERPRINT_MAX_SECRET_BYTES = 4_096;
export const QUOTA_ADMISSION_FINGERPRINT_MAX_SOURCE_LENGTH = REVIEW_MAX_SOURCE_LENGTH;
export const QUOTA_ADMISSION_FINGERPRINT_MAX_SOURCE_BYTES = REVIEW_MAX_SOURCE_LENGTH * 4;
export const QUOTA_ADMISSION_FINGERPRINT_MAX_LANGUAGE_LENGTH = REVIEW_MAX_LANGUAGE_LENGTH;
export const QUOTA_ADMISSION_FINGERPRINT_MAX_LANGUAGE_BYTES = REVIEW_MAX_LANGUAGE_LENGTH * 4;
export const QUOTA_ADMISSION_FINGERPRINT_MAX_TITLE_LENGTH = REVIEW_MAX_TITLE_LENGTH;
export const QUOTA_ADMISSION_FINGERPRINT_MAX_TITLE_BYTES = REVIEW_MAX_TITLE_LENGTH * 4;
export const QUOTA_ADMISSION_FINGERPRINT_MAX_CONTEXT_LENGTH = REVIEW_MAX_CONTEXT_LENGTH;
export const QUOTA_ADMISSION_FINGERPRINT_MAX_CONTEXT_BYTES = REVIEW_MAX_CONTEXT_LENGTH * 4;
export const QUOTA_ADMISSION_FINGERPRINT_MAX_VERSION = 2_147_483_647;

const LENGTH_PREFIX_BYTES = 4;
const MAX_LENGTH_PREFIX_VALUE = 0xffff_ffff;
const FINGERPRINT_HASH_PATTERN = /^[a-f0-9]{64}$/u;

export interface QuotaAdmissionFingerprintInput {
  readonly fingerprintVersion: number;
  readonly source: string;
  readonly language: string;
  readonly mode: ReviewMode;
  readonly learnerLevel: ReviewLearnerLevel;
  readonly title?: string;
  readonly context?: string;
}

export interface QuotaAdmissionFingerprintResult {
  readonly requestFingerprintHash: string;
  readonly fingerprintVersion: number;
}

export type QuotaAdmissionFingerprintInputField =
  | "input"
  | "secret"
  | "fingerprintVersion"
  | "source"
  | "language"
  | "mode"
  | "learnerLevel"
  | "title"
  | "context";

export class QuotaAdmissionFingerprintInputError extends Error {
  readonly field: QuotaAdmissionFingerprintInputField;

  constructor(field: QuotaAdmissionFingerprintInputField) {
    super("Quota admission fingerprint input is invalid.");
    this.name = "QuotaAdmissionFingerprintInputError";
    this.field = field;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isReviewMode(value: unknown): value is ReviewMode {
  return typeof value === "string" && (REVIEW_MODES as readonly string[]).includes(value);
}

function invalid(field: QuotaAdmissionFingerprintInputField): never {
  throw new QuotaAdmissionFingerprintInputError(field);
}

function encodeUtf8(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

function encodeLengthPrefixed(value: Uint8Array): Buffer {
  if (value.byteLength > MAX_LENGTH_PREFIX_VALUE) {
    invalid("input");
  }

  const encoded = Buffer.allocUnsafe(LENGTH_PREFIX_BYTES + value.byteLength);
  encoded.writeUInt32BE(value.byteLength, 0);
  Buffer.from(value).copy(encoded, LENGTH_PREFIX_BYTES);
  return encoded;
}

function validateSecret(secret: unknown): Buffer {
  if (typeof secret !== "string" || secret.length === 0) {
    invalid("secret");
  }

  const secretBytes = encodeUtf8(secret);

  if (
    secretBytes.byteLength < QUOTA_ADMISSION_FINGERPRINT_MIN_SECRET_BYTES ||
    secretBytes.byteLength > QUOTA_ADMISSION_FINGERPRINT_MAX_SECRET_BYTES
  ) {
    invalid("secret");
  }

  return secretBytes;
}

function validateVersion(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > QUOTA_ADMISSION_FINGERPRINT_MAX_VERSION
  ) {
    invalid("fingerprintVersion");
  }

  return value;
}

export function assertQuotaAdmissionFingerprintHash(value: unknown): string {
  if (typeof value !== "string" || !FINGERPRINT_HASH_PATTERN.test(value)) {
    invalid("input");
  }

  return value;
}

export function assertQuotaAdmissionFingerprintVersion(value: unknown): number {
  return validateVersion(value);
}

function validateSource(value: unknown): Buffer {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > QUOTA_ADMISSION_FINGERPRINT_MAX_SOURCE_LENGTH
  ) {
    invalid("source");
  }

  const sourceBytes = encodeUtf8(value);

  if (sourceBytes.byteLength > QUOTA_ADMISSION_FINGERPRINT_MAX_SOURCE_BYTES) {
    invalid("source");
  }

  return sourceBytes;
}

function normalizeLanguage(value: unknown): Buffer {
  if (typeof value !== "string") {
    invalid("language");
  }

  const normalized = value.normalize("NFC").trim().toLowerCase();

  if (
    normalized.length === 0 ||
    normalized.length > QUOTA_ADMISSION_FINGERPRINT_MAX_LANGUAGE_LENGTH
  ) {
    invalid("language");
  }

  const languageBytes = encodeUtf8(normalized);

  if (languageBytes.byteLength > QUOTA_ADMISSION_FINGERPRINT_MAX_LANGUAGE_BYTES) {
    invalid("language");
  }

  return languageBytes;
}

function validateMode(value: unknown): ReviewMode {
  if (!isReviewMode(value)) {
    invalid("mode");
  }

  return value;
}

function validateLearnerLevel(value: unknown): ReviewLearnerLevel {
  if (typeof value !== "string" || !(REVIEW_LEARNER_LEVELS as readonly string[]).includes(value)) {
    invalid("learnerLevel");
  }

  return value as ReviewLearnerLevel;
}

function validateOptionalText(
  value: unknown,
  field: "title" | "context",
  maximum: number,
  maximumBytes: number,
): Buffer | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    !/\S/u.test(value)
  ) {
    invalid(field);
  }

  const bytes = encodeUtf8(value);

  if (bytes.byteLength > maximumBytes) {
    invalid(field);
  }

  return bytes;
}

function encodeOptionalLengthPrefixed(value: Buffer | undefined): Buffer {
  return value === undefined
    ? Buffer.from([0])
    : Buffer.concat([Buffer.from([1]), encodeLengthPrefixed(value)]);
}

function encodeVersion(value: number): Buffer {
  const encoded = Buffer.allocUnsafe(4);
  encoded.writeUInt32BE(value, 0);
  return encoded;
}

function buildFingerprintMessage(
  fingerprintVersion: number,
  sourceBytes: Buffer,
  languageBytes: Buffer,
  mode: ReviewMode,
  learnerLevel: ReviewLearnerLevel,
  titleBytes: Buffer | undefined,
  contextBytes: Buffer | undefined,
): Buffer {
  return Buffer.concat([
    encodeLengthPrefixed(encodeUtf8(QUOTA_ADMISSION_FINGERPRINT_DOMAIN)),
    encodeLengthPrefixed(encodeVersion(fingerprintVersion)),
    encodeLengthPrefixed(sourceBytes),
    encodeLengthPrefixed(languageBytes),
    encodeLengthPrefixed(encodeUtf8(mode)),
    encodeLengthPrefixed(encodeUtf8(learnerLevel)),
    encodeOptionalLengthPrefixed(titleBytes),
    encodeOptionalLengthPrefixed(contextBytes),
  ]);
}

/**
 * Resolves the review mode before fingerprinting. The hashing function itself
 * requires the caller to pass one of the three persisted ReviewMode values.
 */
export function resolveQuotaAdmissionReviewMode(mode?: unknown): ReviewMode {
  if (mode === undefined) {
    return "STANDARD";
  }

  return validateMode(mode);
}

export function computeQuotaAdmissionFingerprint(
  secret: unknown,
  input: QuotaAdmissionFingerprintInput,
): QuotaAdmissionFingerprintResult {
  const secretBytes = validateSecret(secret);

  if (!isRecord(input)) {
    invalid("input");
  }

  const fingerprintVersion = validateVersion(input.fingerprintVersion);
  const sourceBytes = validateSource(input.source);
  const languageBytes = normalizeLanguage(input.language);
  const mode = validateMode(input.mode);
  const learnerLevel = validateLearnerLevel(input.learnerLevel);
  const titleBytes = validateOptionalText(
    input.title,
    "title",
    QUOTA_ADMISSION_FINGERPRINT_MAX_TITLE_LENGTH,
    QUOTA_ADMISSION_FINGERPRINT_MAX_TITLE_BYTES,
  );
  const contextBytes = validateOptionalText(
    input.context,
    "context",
    QUOTA_ADMISSION_FINGERPRINT_MAX_CONTEXT_LENGTH,
    QUOTA_ADMISSION_FINGERPRINT_MAX_CONTEXT_BYTES,
  );
  const message = buildFingerprintMessage(
    fingerprintVersion,
    sourceBytes,
    languageBytes,
    mode,
    learnerLevel,
    titleBytes,
    contextBytes,
  );
  const requestFingerprintHash = createHmac("sha256", secretBytes).update(message).digest("hex");

  if (!FINGERPRINT_HASH_PATTERN.test(requestFingerprintHash)) {
    invalid("input");
  }

  return { fingerprintVersion, requestFingerprintHash };
}
