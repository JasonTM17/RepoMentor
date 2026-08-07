import type { AiReviewExecution } from "../ai/ai.types.js";
import type { ReviewResult } from "../ai/review-result.schema.js";
import { toReviewResultRecord, type ReviewResultRecord } from "./review-result.persistence.js";
import { REVIEW_MAX_PROCESSING_GENERATION } from "./review.types.js";
import type {
  CreateReviewInput,
  ReviewListInput,
  ReviewListResult,
  ReviewRecord,
  ReviewRepository,
  ReviewStatusTransition,
} from "./review.types.js";

function copyDate(value: Date | null): Date | null {
  return value ? new Date(value) : null;
}

function copyReview(review: ReviewRecord): ReviewRecord {
  return {
    ...review,
    createdAt: new Date(review.createdAt),
    deletedAt: copyDate(review.deletedAt),
    updatedAt: new Date(review.updatedAt),
  };
}

export class InMemoryReviewRepository implements ReviewRepository {
  private readonly reviews = new Map<string, ReviewRecord>();
  private readonly results = new Map<string, ReviewResultRecord>();
  private sequence = 0;

  async create(input: CreateReviewInput): Promise<ReviewRecord> {
    const now = new Date();
    const id = input.id ?? `c${(++this.sequence).toString(36).padStart(24, "0")}`;
    const review: ReviewRecord = {
      createdAt: now,
      deletedAt: null,
      id,
      language: input.language,
      mode: input.mode,
      processingGeneration: 0,
      source: input.source,
      status: "PENDING",
      updatedAt: now,
      userId: input.userId,
    };

    this.reviews.set(id, review);
    return copyReview(review);
  }

  async findByIdForUser(userId: string, id: string): Promise<ReviewRecord | null> {
    const review = this.reviews.get(id);
    return review?.userId === userId && review.deletedAt === null ? copyReview(review) : null;
  }

  async listForUser(input: ReviewListInput): Promise<ReviewListResult> {
    const filtered = [...this.reviews.values()]
      .filter(
        (review) =>
          review.userId === input.userId &&
          review.deletedAt === null &&
          (input.status === undefined || review.status === input.status),
      )
      .sort((left, right) => {
        const createdAt = right.createdAt.getTime() - left.createdAt.getTime();
        return createdAt === 0 ? right.id.localeCompare(left.id) : createdAt;
      });
    const start = (input.page - 1) * input.limit;

    return {
      items: filtered.slice(start, start + input.limit).map(copyReview),
      total: filtered.length,
    };
  }

  async softDeleteForUser(userId: string, id: string, deletedAt: Date): Promise<boolean> {
    const review = this.reviews.get(id);

    if (!review || review.userId !== userId || review.deletedAt !== null) {
      return false;
    }

    this.reviews.set(id, {
      ...review,
      deletedAt: new Date(deletedAt),
      updatedAt: new Date(deletedAt),
    });
    return true;
  }

  async transitionForUser(
    userId: string,
    id: string,
    transition: ReviewStatusTransition,
  ): Promise<ReviewRecord | null> {
    const review = this.reviews.get(id);

    if (
      !review ||
      review.userId !== userId ||
      review.deletedAt !== null ||
      transition.toStatus === "COMPLETED" ||
      (transition.expectedProcessingGeneration !== undefined &&
        transition.expectedProcessingGeneration !== review.processingGeneration) ||
      (transition.toStatus === "PROCESSING" &&
        review.processingGeneration >= REVIEW_MAX_PROCESSING_GENERATION) ||
      !transition.fromStatuses.includes(review.status)
    ) {
      return null;
    }

    const transitioned: ReviewRecord = {
      ...review,
      processingGeneration:
        transition.toStatus === "PROCESSING"
          ? review.processingGeneration + 1
          : review.processingGeneration,
      status: transition.toStatus,
      updatedAt: new Date(transition.now),
    };
    this.reviews.set(id, transitioned);
    return copyReview(transitioned);
  }

  async finalizeForUser(
    userId: string,
    id: string,
    execution: AiReviewExecution<ReviewResult>,
    now: Date,
    expectedProcessingGeneration: number,
  ): Promise<ReviewRecord | null> {
    const review = this.reviews.get(id);

    if (
      !review ||
      review.userId !== userId ||
      review.deletedAt !== null ||
      review.status !== "PROCESSING" ||
      review.processingGeneration !== expectedProcessingGeneration
    ) {
      return null;
    }

    const result = toReviewResultRecord(id, execution, now);
    const completed: ReviewRecord = {
      ...review,
      status: "COMPLETED",
      updatedAt: new Date(now),
    };

    this.results.set(id, result);
    this.reviews.set(id, completed);
    return copyReview(completed);
  }

  async fenceProcessingForUser(
    userId: string,
    id: string,
    now: Date,
    expectedProcessingGeneration: number,
  ): Promise<ReviewRecord | null> {
    const review = this.reviews.get(id);

    if (
      !review ||
      review.userId !== userId ||
      review.deletedAt !== null ||
      review.status !== "PROCESSING" ||
      review.processingGeneration !== expectedProcessingGeneration
    ) {
      return null;
    }

    const fenced: ReviewRecord = {
      ...review,
      status: "CANCELLED",
      updatedAt: new Date(now),
    };
    this.reviews.set(id, fenced);
    return copyReview(fenced);
  }

  async findResultForUser(userId: string, id: string): Promise<ReviewResultRecord | null> {
    const review = this.reviews.get(id);
    const result = this.results.get(id);

    if (
      !review ||
      review.userId !== userId ||
      review.deletedAt !== null ||
      review.status !== "COMPLETED" ||
      !result
    ) {
      return null;
    }

    return {
      ...result,
      createdAt: new Date(result.createdAt),
      result: {
        ...result.result,
        findings: result.result.findings.map((finding) => ({ ...finding })),
      },
      usage: result.usage ? { ...result.usage } : null,
    };
  }
}
