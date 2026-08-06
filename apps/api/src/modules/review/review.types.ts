export const REVIEW_REPOSITORY = Symbol("REVIEW_REPOSITORY");

export const REVIEW_STATUSES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_MODES = ["QUICK", "STANDARD", "DEEP"] as const;
export type ReviewMode = (typeof REVIEW_MODES)[number];

export const REVIEW_MAX_SOURCE_LENGTH = 100_000;
export const REVIEW_MAX_LANGUAGE_LENGTH = 32;
export const REVIEW_MAX_PAGE_SIZE = 50;
export const REVIEW_MAX_PAGE_NUMBER = 10_000;
// Keep the persisted counter below PostgreSQL's signed INTEGER maximum so a
// claim can always advance without overflowing the database column.
export const REVIEW_MAX_PROCESSING_GENERATION = 2_147_483_646;

export interface ReviewRecord {
  readonly id: string;
  readonly userId: string;
  readonly source: string;
  readonly language: string;
  readonly mode: ReviewMode;
  readonly processingGeneration: number;
  readonly status: ReviewStatus;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateReviewInput {
  readonly id?: string;
  readonly userId: string;
  readonly source: string;
  readonly language: string;
  readonly mode: ReviewMode;
}

export interface ReviewListQuery {
  readonly page: number;
  readonly limit: number;
  readonly status?: ReviewStatus;
}

export interface ReviewListInput extends ReviewListQuery {
  readonly userId: string;
}

export interface ReviewListResult {
  readonly items: readonly ReviewRecord[];
  readonly total: number;
}

export interface ReviewStatusTransition {
  readonly fromStatuses: readonly ReviewStatus[];
  readonly expectedProcessingGeneration?: number;
  readonly toStatus: ReviewStatus;
  readonly now: Date;
}

export interface ReviewRepository {
  create(input: CreateReviewInput): Promise<ReviewRecord>;
  findByIdForUser(userId: string, id: string): Promise<ReviewRecord | null>;
  listForUser(input: ReviewListInput): Promise<ReviewListResult>;
  softDeleteForUser(userId: string, id: string, deletedAt: Date): Promise<boolean>;
  transitionForUser(
    userId: string,
    id: string,
    transition: ReviewStatusTransition,
  ): Promise<ReviewRecord | null>;
}
