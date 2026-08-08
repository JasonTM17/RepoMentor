import { Injectable } from "@nestjs/common";
import type { Review as PrismaReview } from "@prisma/client";

import { PrismaService } from "../auth/prisma.service.js";
import {
  ReviewFinalizerConflictError,
  ReviewFinalizerIndeterminateError,
  ReviewFinalizerInputError,
  ReviewFinalizerNotFoundError,
  ReviewFinalizerUnavailableError,
  ReviewFinalizerError,
} from "./review-finalizer.errors.js";
import type {
  FinalizeReviewInput,
  ReviewFinalizer,
  ReviewFinalizerResult,
  ReviewFinalizerSummary,
} from "./review-finalizer.types.js";
import {
  assertReviewFinalizerAdmissionFingerprint,
  assertReviewFinalizerFingerprintMetadata,
} from "./review-finalizer.types.js";
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

const OPAQUE_ID_MAX_LENGTH = 25;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/u;

function assertOpaqueId(value: unknown, field: "admissionId" | "reviewId" | "userId"): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > OPAQUE_ID_MAX_LENGTH ||
    !OPAQUE_ID_PATTERN.test(value)
  ) {
    throw new ReviewFinalizerInputError(field);
  }

  return value;
}

function assertSource(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > REVIEW_MAX_SOURCE_LENGTH ||
    !/\S/u.test(value)
  ) {
    throw new ReviewFinalizerInputError("source");
  }

  return value;
}

function canonicalLanguage(value: unknown): string {
  if (typeof value !== "string") {
    throw new ReviewFinalizerInputError("language");
  }

  const language = value.trim().toLowerCase();

  if (
    language.length < 1 ||
    language.length > REVIEW_MAX_LANGUAGE_LENGTH ||
    !/^[a-z0-9#+._-]+$/u.test(language)
  ) {
    throw new ReviewFinalizerInputError("language");
  }

  return language;
}

function assertMode(value: unknown): ReviewMode {
  if (typeof value !== "string" || !(REVIEW_MODES as readonly string[]).includes(value)) {
    throw new ReviewFinalizerInputError("mode");
  }

  return value as ReviewMode;
}

function assertLearnerLevel(value: unknown): ReviewLearnerLevel {
  if (typeof value !== "string" || !(REVIEW_LEARNER_LEVELS as readonly string[]).includes(value)) {
    throw new ReviewFinalizerInputError("learnerLevel");
  }

  return value as ReviewLearnerLevel;
}

function assertOptionalMetadata(
  value: unknown,
  field: "title" | "context",
  maximum: number,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    !/\S/u.test(value)
  ) {
    throw new ReviewFinalizerInputError(field);
  }

  return value;
}

function assertDate(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new ReviewFinalizerInputError("now");
  }

  return new Date(value);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "P2002"
  );
}

function isReviewFinalizerError(error: unknown): error is ReviewFinalizerError {
  return error instanceof ReviewFinalizerError;
}

function mapPersistenceError(error: unknown): ReviewFinalizerError {
  if (isReviewFinalizerError(error)) {
    return error;
  }

  if (isUniqueViolation(error)) {
    return new ReviewFinalizerConflictError();
  }

  return new ReviewFinalizerUnavailableError();
}

function toSummary(review: PrismaReview): ReviewFinalizerSummary {
  return {
    createdAt: new Date(review.createdAt),
    id: review.id,
    language: review.language,
    mode: review.mode,
    learnerLevel: review.learnerLevel,
    ...(review.title === null ? {} : { title: review.title }),
    ...(review.context === null ? {} : { context: review.context }),
    status: review.status,
    updatedAt: new Date(review.updatedAt),
  };
}

function assertReviewMatchesAdmission(
  review: PrismaReview,
  userId: string,
  reviewId: string,
  mode: ReviewMode,
): void {
  if (review.id !== reviewId || review.userId !== userId || review.mode !== mode) {
    throw new ReviewFinalizerConflictError();
  }
}

@Injectable()
export class PrismaReviewFinalizer implements ReviewFinalizer {
  constructor(private readonly prisma: PrismaService) {}

  async finalize(input: FinalizeReviewInput): Promise<ReviewFinalizerResult> {
    if (typeof input !== "object" || input === null) {
      throw new ReviewFinalizerInputError("input");
    }

    const userId = assertOpaqueId(input.userId, "userId");
    const admissionId = assertOpaqueId(input.admissionId, "admissionId");
    const reviewId = assertOpaqueId(input.reviewId, "reviewId");
    const source = assertSource(input.source);
    const language = canonicalLanguage(input.language);
    const mode = assertMode(input.mode);
    const learnerLevel = assertLearnerLevel(input.learnerLevel);
    const title = assertOptionalMetadata(input.title, "title", REVIEW_MAX_TITLE_LENGTH);
    const context = assertOptionalMetadata(input.context, "context", REVIEW_MAX_CONTEXT_LENGTH);
    const fingerprintMetadata = assertReviewFinalizerFingerprintMetadata(input);
    const now = assertDate(input.now);

    try {
      return await this.prisma.transaction(async (transaction) => {
        const admission = await transaction.quotaAdmission.findFirst({
          where: { id: admissionId, userId },
        });

        if (!admission) {
          throw new ReviewFinalizerNotFoundError();
        }

        if (admission.reviewId !== reviewId || admission.mode !== mode) {
          throw new ReviewFinalizerConflictError();
        }

        assertReviewFinalizerAdmissionFingerprint(admission, fingerprintMetadata);

        if (admission.status === "ADMITTED") {
          const existing = await transaction.review.findFirst({
            where: { deletedAt: null, id: admission.reviewId, userId },
          });

          if (!existing) {
            throw new ReviewFinalizerIndeterminateError();
          }

          assertReviewMatchesAdmission(existing, userId, admission.reviewId, admission.mode);
          return { kind: "REPLAYED", summary: toSummary(existing) };
        }

        if (admission.status !== "RESERVED") {
          throw new ReviewFinalizerConflictError();
        }

        const created = await transaction.review.create({
          data: {
            createdAt: now,
            eventSequence: 1,
            id: admission.reviewId,
            language,
            mode: admission.mode,
            learnerLevel,
            ...(title === undefined ? {} : { title }),
            ...(context === undefined ? {} : { context }),
            source,
            status: "PENDING",
            updatedAt: now,
            userId,
          },
        });

        await transaction.reviewEvent.create({
          data: {
            createdAt: now,
            processingGeneration: created.processingGeneration,
            resultAvailable: false,
            reviewId: created.id,
            sequence: created.eventSequence,
            status: created.status,
            type: "SNAPSHOT",
          },
        });

        assertReviewMatchesAdmission(created, userId, admission.reviewId, admission.mode);
        if (
          created.language !== language ||
          created.learnerLevel !== learnerLevel ||
          created.title !== title ||
          created.context !== context ||
          created.source !== source ||
          created.status !== "PENDING"
        ) {
          throw new ReviewFinalizerConflictError();
        }

        const admitted = await transaction.quotaAdmission.updateMany({
          data: { status: "ADMITTED", updatedAt: now },
          where: {
            id: admissionId,
            reviewId: admission.reviewId,
            status: "RESERVED",
            userId,
          },
        });

        if (admitted.count !== 1) {
          throw new ReviewFinalizerConflictError();
        }

        return { kind: "FINALIZED", summary: toSummary(created) };
      });
    } catch (error: unknown) {
      throw mapPersistenceError(error);
    }
  }
}
