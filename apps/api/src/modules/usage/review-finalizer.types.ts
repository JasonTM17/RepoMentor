import type { ReviewMode, ReviewStatus } from "../review/review.types.js";
import type { QuotaAdmissionStatus } from "./quota-admission.types.js";

/** Injection token reserved for the later Prisma-backed finalizer adapter. */
export const REVIEW_FINALIZER = Symbol("REVIEW_FINALIZER");

export interface FinalizeReviewInput {
  readonly userId: string;
  readonly admissionId: string;
  /** Must equal the reviewId preallocated on the quota admission. */
  readonly reviewId: string;
  readonly source: string;
  readonly language: string;
  readonly mode: ReviewMode;
  readonly now: Date;
}

/** Deliberately omits source and userId from every finalizer response. */
export interface ReviewFinalizerSummary {
  readonly id: string;
  readonly language: string;
  readonly mode: ReviewMode;
  readonly status: ReviewStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type ReviewFinalizerResult =
  | {
      readonly kind: "FINALIZED";
      readonly summary: ReviewFinalizerSummary;
    }
  | {
      readonly kind: "REPLAYED";
      readonly summary: ReviewFinalizerSummary;
    };

export interface ReviewFinalizer {
  /**
   * Finalizes only an owner-scoped RESERVED admission. A Prisma adapter must
   * create the Review row and mark the admission ADMITTED in one transaction.
   * An ADMITTED admission is a read-only replay when its review still exists.
   */
  finalize(input: FinalizeReviewInput): Promise<ReviewFinalizerResult>;
}

export interface ReviewFinalizerReviewCreateData {
  readonly id: string;
  readonly userId: string;
  readonly source: string;
  readonly language: string;
  readonly mode: ReviewMode;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ReviewFinalizerReviewRow extends ReviewFinalizerSummary {
  readonly userId: string;
  readonly source: string;
}

export interface ReviewFinalizerAdmissionRow {
  readonly id: string;
  readonly userId: string;
  readonly reviewId: string;
  readonly mode: ReviewMode;
  readonly status: QuotaAdmissionStatus;
  readonly updatedAt: Date;
}

/** Minimal Prisma transaction surface required by a future adapter. */
export interface ReviewFinalizerTransaction {
  readonly review: {
    create(input: {
      readonly data: ReviewFinalizerReviewCreateData;
    }): Promise<ReviewFinalizerReviewRow>;
    findFirst(input: {
      readonly where: { readonly id: string; readonly userId: string };
    }): Promise<ReviewFinalizerReviewRow | null>;
  };
  readonly quotaAdmission: {
    findFirst(input: {
      readonly where: { readonly id: string; readonly userId: string };
    }): Promise<ReviewFinalizerAdmissionRow | null>;
    updateMany(input: {
      readonly data: { readonly status: "ADMITTED"; readonly updatedAt: Date };
      readonly where: {
        readonly id: string;
        readonly userId: string;
        readonly reviewId: string;
        readonly status: "RESERVED";
      };
    }): Promise<{ readonly count: number }>;
  };
}

/**
 * The adapter boundary is intentionally transaction-shaped: both writes for
 * a RESERVED admission must happen inside this callback and reject together.
 */
export interface ReviewFinalizerTransactionRunner {
  transaction<T>(callback: (transaction: ReviewFinalizerTransaction) => Promise<T>): Promise<T>;
}
