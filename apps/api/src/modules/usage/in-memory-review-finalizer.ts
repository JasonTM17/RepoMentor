import {
  ReviewFinalizerConflictError,
  ReviewFinalizerIndeterminateError,
  ReviewFinalizerNotFoundError,
  type ReviewFinalizerError,
} from "./review-finalizer.errors.js";
import type {
  FinalizeReviewInput,
  ReviewFinalizer,
  ReviewFinalizerAdmissionRow,
  ReviewFinalizerResult,
  ReviewFinalizerSummary,
} from "./review-finalizer.types.js";

interface StoredReview extends ReviewFinalizerSummary {
  readonly userId: string;
  readonly source: string;
}

interface InMemoryReviewFinalizerOptions {
  readonly failAfterReviewCreate?: ReviewFinalizerError;
}

export interface SeedReservedAdmission {
  readonly id: string;
  readonly userId: string;
  readonly reviewId: string;
  readonly mode: FinalizeReviewInput["mode"];
  readonly updatedAt: Date;
}

/**
 * Deterministic contract seam for unit tests. It models the two writes as one
 * rollback-capable operation; it is not a production persistence adapter.
 */
export class InMemoryReviewFinalizer implements ReviewFinalizer {
  private readonly admissions = new Map<string, ReviewFinalizerAdmissionRow>();
  private readonly reviews = new Map<string, StoredReview>();
  private readonly failAfterReviewCreate: ReviewFinalizerError | undefined;

  constructor(options: InMemoryReviewFinalizerOptions = {}) {
    this.failAfterReviewCreate = options.failAfterReviewCreate;
  }

  seedReservedAdmission(input: SeedReservedAdmission): void {
    this.admissions.set(input.id, {
      id: input.id,
      mode: input.mode,
      reviewId: input.reviewId,
      status: "RESERVED",
      updatedAt: new Date(input.updatedAt),
      userId: input.userId,
    });
  }

  seedAdmittedAdmission(input: SeedReservedAdmission): void {
    this.admissions.set(input.id, {
      id: input.id,
      mode: input.mode,
      reviewId: input.reviewId,
      status: "ADMITTED",
      updatedAt: new Date(input.updatedAt),
      userId: input.userId,
    });
  }

  seedDeniedAdmission(input: SeedReservedAdmission): void {
    this.admissions.set(input.id, {
      id: input.id,
      mode: input.mode,
      reviewId: input.reviewId,
      status: "DENIED",
      updatedAt: new Date(input.updatedAt),
      userId: input.userId,
    });
  }

  findSummary(userId: string, reviewId: string): ReviewFinalizerSummary | null {
    const review = this.reviews.get(reviewId);
    return review?.userId === userId ? copySummary(review) : null;
  }

  findAdmission(userId: string, admissionId: string): ReviewFinalizerAdmissionRow | null {
    const admission = this.admissions.get(admissionId);
    return admission?.userId === userId ? copyAdmission(admission) : null;
  }

  async finalize(input: FinalizeReviewInput): Promise<ReviewFinalizerResult> {
    const admission = this.admissions.get(input.admissionId);

    if (!admission || admission.userId !== input.userId) {
      throw new ReviewFinalizerNotFoundError();
    }

    if (admission.reviewId !== input.reviewId || admission.mode !== input.mode) {
      throw new ReviewFinalizerConflictError();
    }

    if (admission.status === "ADMITTED") {
      const existing = this.reviews.get(admission.reviewId);

      if (!existing) {
        throw new ReviewFinalizerIndeterminateError();
      }

      return { kind: "REPLAYED", summary: copySummary(existing) };
    }

    if (admission.status !== "RESERVED") {
      throw new ReviewFinalizerConflictError();
    }

    const previousAdmission = copyAdmission(admission);
    const review: StoredReview = {
      createdAt: new Date(input.now),
      id: input.reviewId,
      language: input.language,
      mode: input.mode,
      source: input.source,
      status: "PENDING",
      updatedAt: new Date(input.now),
      userId: input.userId,
    };

    this.reviews.set(review.id, review);

    try {
      if (this.failAfterReviewCreate) {
        throw this.failAfterReviewCreate;
      }

      this.admissions.set(input.admissionId, {
        ...admission,
        status: "ADMITTED",
        updatedAt: new Date(input.now),
      });
    } catch (error) {
      this.reviews.delete(review.id);
      this.admissions.set(input.admissionId, previousAdmission);
      throw error;
    }

    return { kind: "FINALIZED", summary: copySummary(review) };
  }
}

function copyAdmission(admission: ReviewFinalizerAdmissionRow): ReviewFinalizerAdmissionRow {
  return { ...admission, updatedAt: new Date(admission.updatedAt) };
}

function copySummary(review: StoredReview): ReviewFinalizerSummary {
  return {
    createdAt: new Date(review.createdAt),
    id: review.id,
    language: review.language,
    mode: review.mode,
    status: review.status,
    updatedAt: new Date(review.updatedAt),
  };
}
