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
      !transition.fromStatuses.includes(review.status)
    ) {
      return null;
    }

    const transitioned: ReviewRecord = {
      ...review,
      status: transition.toStatus,
      updatedAt: new Date(transition.now),
    };
    this.reviews.set(id, transitioned);
    return copyReview(transitioned);
  }
}
