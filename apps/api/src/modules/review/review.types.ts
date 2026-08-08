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

export const REVIEW_SORT_ORDERS = ["asc", "desc"] as const;
export type ReviewSortOrder = (typeof REVIEW_SORT_ORDERS)[number];

export const REVIEW_LEARNER_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export type ReviewLearnerLevel = (typeof REVIEW_LEARNER_LEVELS)[number];

export const REVIEW_MAX_SOURCE_LENGTH = 100_000;
export const REVIEW_MAX_LANGUAGE_LENGTH = 32;
export const REVIEW_MAX_TITLE_LENGTH = 80;
export const REVIEW_MAX_CONTEXT_LENGTH = 500;
export const REVIEW_MAX_PAGE_SIZE = 50;
export const REVIEW_MAX_PAGE_NUMBER = 10_000;
export const REVIEW_MAX_BULK_DELETE_IDS = 100;
// Keep the persisted counter below PostgreSQL's signed INTEGER maximum so a
// claim can always advance without overflowing the database column.
export const REVIEW_MAX_PROCESSING_GENERATION = 2_147_483_646;
export const REVIEW_MAX_EVENT_SEQUENCE = 2_147_483_646;

export const REVIEW_EVENT_TYPES = ["SNAPSHOT", "COMPLETED", "FAILED", "CANCELLED"] as const;
export type ReviewEventType = (typeof REVIEW_EVENT_TYPES)[number];

export interface ReviewRecord {
  readonly id: string;
  readonly userId: string;
  readonly source: string;
  readonly language: string;
  readonly mode: ReviewMode;
  readonly learnerLevel: ReviewLearnerLevel;
  readonly title?: string;
  readonly context?: string;
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
  readonly learnerLevel: ReviewLearnerLevel;
  readonly title?: string;
  readonly context?: string;
}

export interface ReviewListQuery {
  readonly page: number;
  readonly limit: number;
  readonly title?: string;
  readonly language?: string;
  readonly mode?: ReviewMode;
  readonly status?: ReviewStatus;
  readonly sort?: ReviewSortOrder;
}

export interface ReviewListInput extends ReviewListQuery {
  readonly userId: string;
}

export interface ReviewListResult {
  readonly items: readonly ReviewRecord[];
  readonly total: number;
}

export interface ReviewBulkDeleteResult {
  readonly deletedCount: number;
}

export interface ReviewStatusTransition {
  readonly fromStatuses: readonly ReviewStatus[];
  readonly expectedProcessingGeneration?: number;
  readonly retryable?: boolean;
  readonly toStatus: ReviewStatus;
  readonly now: Date;
}

export interface ReviewEventRecord {
  readonly reviewId: string;
  readonly sequence: number;
  readonly type: ReviewEventType;
  readonly status: ReviewStatus;
  readonly generation: number;
  readonly resultAvailable: boolean;
  readonly retryable: boolean | null;
  readonly createdAt: Date;
}

export interface ReviewRepository {
  create(input: CreateReviewInput): Promise<ReviewRecord>;
  findByIdForUser(userId: string, id: string): Promise<ReviewRecord | null>;
  listForUser(input: ReviewListInput): Promise<ReviewListResult>;
  softDeleteForUser(userId: string, id: string, deletedAt: Date): Promise<boolean>;
  softDeleteManyForUser(userId: string, ids: readonly string[], deletedAt: Date): Promise<number>;
  transitionForUser(
    userId: string,
    id: string,
    transition: ReviewStatusTransition,
  ): Promise<ReviewRecord | null>;
  listEventsForUser(
    userId: string,
    id: string,
    afterSequence: number,
    limit: number,
  ): Promise<readonly ReviewEventRecord[]>;
  latestEventForUser(userId: string, id: string): Promise<ReviewEventRecord | null>;
}
