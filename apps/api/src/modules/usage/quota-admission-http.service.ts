import { Inject, Injectable } from "@nestjs/common";

import { RedisUnavailableError } from "../redis/redis.errors.js";
import { reserveQuotaAdmission } from "../redis/redis.admission.js";
import type { RedisCommandExecutor } from "../redis/redis.types.js";
import {
  QUOTA_ADMISSION_FINGERPRINT_CONFIG,
  type QuotaAdmissionFingerprintConfig,
} from "./quota-admission.config.js";
import { QuotaAdmissionConflictError, QuotaAdmissionInputError } from "./quota-admission.errors.js";
import {
  computeQuotaAdmissionFingerprint,
  QUOTA_ADMISSION_FINGERPRINT_VERSION,
  QuotaAdmissionFingerprintInputError,
  resolveQuotaAdmissionReviewMode,
} from "./quota-admission.fingerprint.js";
import { createOpaqueAdmissionId, normalizeIdempotencyKey } from "./quota-admission.hash.js";
import { QuotaAdmissionService } from "./quota-admission.service.js";
import type { ReviewMode } from "../review/review.types.js";
import type { QuotaAdmissionRecord } from "./quota-admission.types.js";
import {
  QuotaAdmissionFinalizerConflictError,
  QuotaAdmissionFinalizerNotFoundError,
  QuotaAdmissionRateLimitError,
  QuotaAdmissionUnavailableError,
} from "./quota-admission-http.errors.js";
import {
  ReviewFinalizerConflictError,
  ReviewFinalizerIndeterminateError,
  ReviewFinalizerNotFoundError,
  ReviewFinalizerUnavailableError,
} from "./review-finalizer.errors.js";
import {
  REVIEW_FINALIZER,
  type FinalizeReviewInput,
  type ReviewFinalizer,
  type ReviewFinalizerResult,
  type ReviewFinalizerSummary,
} from "./review-finalizer.types.js";
import { USAGE_REDIS_CONFIG, type UsageRedisConfig } from "./usage.config.js";

/** Reserved for module wiring after the transport slice is integrated. */
export const QUOTA_ADMISSION_REDIS_EXECUTOR = Symbol("QUOTA_ADMISSION_REDIS_EXECUTOR");

const MIN_RETRY_AFTER_SECONDS = 1;
const MAX_RETRY_AFTER_SECONDS = 86_400;

export interface AuthenticatedQuotaAdmissionInput {
  readonly userId: string;
  readonly idempotencyKey: unknown;
  readonly source: unknown;
  readonly language: unknown;
  readonly mode?: unknown;
  readonly now?: Date;
}

export interface QuotaAdmissionHttpResult {
  readonly kind: "CREATED" | "REPLAYED";
  readonly created: boolean;
  readonly replayed: boolean;
  readonly admissionCreated: boolean;
  readonly summary: ReviewFinalizerSummary;
}

interface FingerprintAwareFinalizeReviewInput extends FinalizeReviewInput {
  readonly requestFingerprintHash: string;
  readonly fingerprintVersion: number;
}

function canonicalizeLanguage(value: unknown): string {
  if (typeof value !== "string") {
    throw new QuotaAdmissionInputError("language");
  }

  return value.normalize("NFC").trim().toLowerCase();
}

function canonicalizeSource(value: unknown): string {
  if (typeof value !== "string") {
    throw new QuotaAdmissionInputError("source");
  }

  return value;
}

function canonicalizeMode(value: unknown): ReviewMode {
  try {
    return resolveQuotaAdmissionReviewMode(value);
  } catch (error: unknown) {
    if (error instanceof QuotaAdmissionFingerprintInputError) {
      throw new QuotaAdmissionInputError("mode");
    }

    throw error;
  }
}

function boundedRetryAfterSeconds(value: number): number {
  if (!Number.isSafeInteger(value)) {
    return MAX_RETRY_AFTER_SECONDS;
  }

  return Math.min(Math.max(value, MIN_RETRY_AFTER_SECONDS), MAX_RETRY_AFTER_SECONDS);
}

@Injectable()
export class QuotaAdmissionHttpService {
  constructor(
    private readonly quotaAdmission: QuotaAdmissionService,
    @Inject(QUOTA_ADMISSION_REDIS_EXECUTOR)
    private readonly redisExecutor: RedisCommandExecutor,
    @Inject(USAGE_REDIS_CONFIG)
    private readonly redisConfig: UsageRedisConfig,
    @Inject(QUOTA_ADMISSION_FINGERPRINT_CONFIG)
    private readonly fingerprintConfig: QuotaAdmissionFingerprintConfig,
    @Inject(REVIEW_FINALIZER)
    private readonly reviewFinalizer: ReviewFinalizer,
  ) {}

  async create(input: AuthenticatedQuotaAdmissionInput): Promise<QuotaAdmissionHttpResult> {
    return this.admit(input);
  }

  async admit(input: AuthenticatedQuotaAdmissionInput): Promise<QuotaAdmissionHttpResult> {
    const now = input.now ?? new Date();
    const source = canonicalizeSource(input.source);
    const language = canonicalizeLanguage(input.language);
    const mode = canonicalizeMode(input.mode);
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    const fingerprint = computeQuotaAdmissionFingerprint(this.fingerprintConfig.fingerprintSecret, {
      fingerprintVersion: QUOTA_ADMISSION_FINGERPRINT_VERSION,
      language,
      mode,
      source,
    });
    const candidateAdmissionId = createOpaqueAdmissionId();
    const candidateReviewId = createOpaqueAdmissionId();

    let intent: Awaited<ReturnType<QuotaAdmissionService["createIntent"]>>;

    try {
      intent = await this.quotaAdmission.createIntent({
        admissionId: candidateAdmissionId,
        fingerprintVersion: fingerprint.fingerprintVersion,
        idempotencyKey,
        mode,
        now,
        requestFingerprintHash: fingerprint.requestFingerprintHash,
        reviewId: candidateReviewId,
        userId: input.userId,
      });
    } catch (error) {
      if (
        error instanceof QuotaAdmissionInputError ||
        error instanceof QuotaAdmissionConflictError
      ) {
        throw error;
      }

      await this.markSafeStatus(input.userId, candidateAdmissionId, now, "RECONCILE_REQUIRED");
      throw new QuotaAdmissionUnavailableError();
    }

    let record = intent.record;

    if (!intent.created) {
      try {
        const current = await this.quotaAdmission.findForOwner(input.userId, record.id);
        if (!current) {
          await this.markSafeStatus(input.userId, record.id, now, "RECONCILE_REQUIRED");
          throw new QuotaAdmissionUnavailableError();
        }

        record = current;
      } catch (error) {
        if (error instanceof QuotaAdmissionUnavailableError) {
          throw error;
        }

        await this.markSafeStatus(input.userId, record.id, now, "RECONCILE_REQUIRED");
        throw new QuotaAdmissionUnavailableError();
      }
    }

    if (record.status === "PENDING") {
      record = await this.reservePending(input.userId, record, now);
    }

    if (record.status === "DENIED") {
      throw new QuotaAdmissionRateLimitError(MAX_RETRY_AFTER_SECONDS);
    }

    if (record.status === "INDETERMINATE" || record.status === "RECONCILE_REQUIRED") {
      throw new QuotaAdmissionUnavailableError();
    }

    if (record.status !== "RESERVED" && record.status !== "ADMITTED") {
      throw new QuotaAdmissionUnavailableError();
    }

    return this.finalize(input, record, intent.created, source, language, now, fingerprint);
  }

  private async reservePending(
    userId: string,
    record: QuotaAdmissionRecord,
    now: Date,
  ): Promise<QuotaAdmissionRecord> {
    let reservation: Awaited<ReturnType<typeof reserveQuotaAdmission>>;

    try {
      reservation = await reserveQuotaAdmission(this.redisExecutor, this.redisConfig, {
        admissionId: record.id,
        identity: record.userId,
        mode: record.mode,
        namespace: "authenticated",
        now,
        utcDay: record.utcDay,
      });
    } catch (error) {
      if (error instanceof RedisUnavailableError || error instanceof Error) {
        await this.markSafeStatus(userId, record.id, now, "INDETERMINATE");
        throw new QuotaAdmissionUnavailableError();
      }

      await this.markSafeStatus(userId, record.id, now, "INDETERMINATE");
      throw new QuotaAdmissionUnavailableError();
    }

    if (reservation.outcome === "RESERVED") {
      return this.persistKnownReservation(userId, record, now, "RESERVED");
    }

    if (reservation.outcome === "DENIED") {
      const denied = await this.persistKnownReservation(userId, record, now, "DENIED");
      if (denied.status !== "DENIED") {
        throw new QuotaAdmissionUnavailableError();
      }

      throw new QuotaAdmissionRateLimitError(
        boundedRetryAfterSeconds(reservation.retryAfterSeconds),
      );
    }

    await this.markSafeStatus(userId, record.id, now, "RECONCILE_REQUIRED");
    throw new QuotaAdmissionUnavailableError();
  }

  private async persistKnownReservation(
    userId: string,
    record: QuotaAdmissionRecord,
    now: Date,
    status: "RESERVED" | "DENIED",
  ): Promise<QuotaAdmissionRecord> {
    let updated: QuotaAdmissionRecord | undefined;

    try {
      updated = await this.quotaAdmission.transitionForOwner(userId, record.id, status, now);
    } catch {
      // A concurrent request may have completed the same owner-scoped write.
    }

    if (updated?.status === status) {
      return updated;
    }

    const current = await this.readAfterTransitionRace(userId, record.id, status);
    if (current) {
      return current;
    }

    await this.markSafeStatus(userId, record.id, now, "RECONCILE_REQUIRED");
    throw new QuotaAdmissionUnavailableError();
  }

  private async readAfterTransitionRace(
    userId: string,
    admissionId: string,
    expected: "RESERVED" | "DENIED",
  ): Promise<QuotaAdmissionRecord | null> {
    try {
      const current = await this.quotaAdmission.findForOwner(userId, admissionId);

      if (
        current &&
        (current.status === expected || (expected === "RESERVED" && current.status === "ADMITTED"))
      ) {
        return current;
      }
    } catch {
      // Preserve the safe fallback below when the reread is also unavailable.
    }

    return null;
  }

  private async finalize(
    input: AuthenticatedQuotaAdmissionInput,
    record: QuotaAdmissionRecord,
    admissionCreated: boolean,
    source: string,
    language: string,
    now: Date,
    fingerprint: { readonly requestFingerprintHash: string; readonly fingerprintVersion: number },
  ): Promise<QuotaAdmissionHttpResult> {
    const finalizerInput: FingerprintAwareFinalizeReviewInput = {
      admissionId: record.id,
      fingerprintVersion: fingerprint.fingerprintVersion,
      language,
      mode: record.mode,
      now,
      requestFingerprintHash: fingerprint.requestFingerprintHash,
      reviewId: record.reviewId,
      source,
      userId: record.userId,
    };
    let result: ReviewFinalizerResult;

    try {
      result = await this.reviewFinalizer.finalize(finalizerInput);
    } catch (error) {
      if (error instanceof ReviewFinalizerConflictError) {
        throw new QuotaAdmissionFinalizerConflictError();
      }

      if (error instanceof ReviewFinalizerNotFoundError) {
        throw new QuotaAdmissionFinalizerNotFoundError();
      }

      if (
        error instanceof ReviewFinalizerUnavailableError ||
        error instanceof ReviewFinalizerIndeterminateError ||
        error instanceof Error
      ) {
        await this.markSafeStatus(input.userId, record.id, now, "RECONCILE_REQUIRED");
        throw new QuotaAdmissionUnavailableError();
      }

      await this.markSafeStatus(input.userId, record.id, now, "RECONCILE_REQUIRED");
      throw new QuotaAdmissionUnavailableError();
    }

    const replayed = result.kind === "REPLAYED";
    return {
      admissionCreated,
      created: !replayed,
      kind: replayed ? "REPLAYED" : "CREATED",
      replayed,
      summary: result.summary,
    };
  }

  private async markSafeStatus(
    userId: string,
    admissionId: string,
    now: Date,
    preferred: "INDETERMINATE" | "RECONCILE_REQUIRED",
  ): Promise<void> {
    try {
      await this.quotaAdmission.transitionForOwner(userId, admissionId, preferred, now);
      return;
    } catch {
      const fallback = preferred === "INDETERMINATE" ? "RECONCILE_REQUIRED" : "INDETERMINATE";

      try {
        await this.quotaAdmission.transitionForOwner(userId, admissionId, fallback, now);
      } catch {
        // The outcome of the failed persistence operation remains unknown.
        // Never compensate Redis or expose the underlying storage error.
      }
    }
  }
}
