import { Injectable } from "@nestjs/common";
import type {
  Prisma,
  Review as PrismaReview,
  ReviewResult as PrismaReviewResult,
  ReviewUsage as PrismaReviewUsage,
} from "@prisma/client";

import type { AiReviewExecution } from "../ai/ai.types.js";
import type { ReviewResult } from "../ai/review-result.schema.js";
import { PrismaService } from "../auth/prisma.service.js";
import {
  parsePersistedReviewResult,
  validatePersistedAiReviewExecution,
  type ReviewResultRecord,
} from "./review-result.persistence.js";
import { REVIEW_MAX_PROCESSING_GENERATION } from "./review.types.js";
import type {
  CreateReviewInput,
  ReviewListInput,
  ReviewListResult,
  ReviewRecord,
  ReviewRepository,
  ReviewStatusTransition,
} from "./review.types.js";

function mapReview(row: PrismaReview): ReviewRecord {
  return {
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
    id: row.id,
    language: row.language,
    mode: row.mode,
    processingGeneration: row.processingGeneration,
    source: row.source,
    status: row.status,
    updatedAt: row.updatedAt,
    userId: row.userId,
  };
}

type PrismaReviewResultWithUsage = PrismaReviewResult & {
  usage: PrismaReviewUsage | null;
};

function mapReviewResult(row: PrismaReviewResultWithUsage): ReviewResultRecord {
  return {
    attempts: row.attempts,
    createdAt: row.createdAt,
    durationMs: row.durationMs,
    model: row.model as ReviewResultRecord["model"],
    provider: row.provider as ReviewResultRecord["provider"],
    reasoningEffort: row.reasoningEffort as ReviewResultRecord["reasoningEffort"],
    result: parsePersistedReviewResult(row.result),
    reviewId: row.reviewId,
    usage:
      row.usage === null
        ? null
        : {
            ...(row.usage.cachedInputTokens === null
              ? {}
              : { cachedInputTokens: row.usage.cachedInputTokens }),
            inputTokens: row.usage.inputTokens,
            outputTokens: row.usage.outputTokens,
            totalTokens: row.usage.totalTokens,
          },
  };
}

@Injectable()
export class PrismaReviewRepository implements ReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateReviewInput): Promise<ReviewRecord> {
    const review = await this.prisma.review.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        language: input.language,
        mode: input.mode,
        source: input.source,
        userId: input.userId,
      },
    });

    return mapReview(review);
  }

  async findByIdForUser(userId: string, id: string): Promise<ReviewRecord | null> {
    const review = await this.prisma.review.findFirst({
      where: { deletedAt: null, id, userId },
    });

    return review ? mapReview(review) : null;
  }

  async listForUser(input: ReviewListInput): Promise<ReviewListResult> {
    const where: Prisma.ReviewWhereInput = {
      deletedAt: null,
      userId: input.userId,
      ...(input.status ? { status: input.status } : {}),
    };
    const [total, reviews] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        where,
      }),
    ]);

    return {
      items: reviews.map(mapReview),
      total,
    };
  }

  async softDeleteForUser(userId: string, id: string, deletedAt: Date): Promise<boolean> {
    const result = await this.prisma.review.updateMany({
      data: { deletedAt },
      where: { deletedAt: null, id, userId },
    });

    return result.count === 1;
  }

  async transitionForUser(
    userId: string,
    id: string,
    transition: ReviewStatusTransition,
  ): Promise<ReviewRecord | null> {
    if (transition.toStatus === "COMPLETED") {
      return null;
    }

    const generationPredicates: Prisma.ReviewWhereInput[] = [
      ...(transition.expectedProcessingGeneration === undefined
        ? []
        : [{ processingGeneration: transition.expectedProcessingGeneration }]),
      ...(transition.toStatus === "PROCESSING"
        ? [{ processingGeneration: { lt: REVIEW_MAX_PROCESSING_GENERATION } }]
        : []),
    ];
    const where: Prisma.ReviewWhereInput = {
      deletedAt: null,
      id,
      status: { in: [...transition.fromStatuses] },
      userId,
      ...(generationPredicates.length === 0 ? {} : { AND: generationPredicates }),
    };
    const data: Prisma.ReviewUpdateManyMutationInput = {
      status: transition.toStatus,
      updatedAt: transition.now,
      ...(transition.toStatus === "PROCESSING" ? { processingGeneration: { increment: 1 } } : {}),
    };

    return this.prisma.transaction(async (transaction) => {
      const result = await transaction.review.updateMany({ data, where });

      if (result.count !== 1) {
        return null;
      }

      const review = await transaction.review.findFirst({
        where: { deletedAt: null, id, userId },
      });

      return review ? mapReview(review) : null;
    });
  }

  async finalizeForUser(
    userId: string,
    id: string,
    execution: AiReviewExecution<ReviewResult>,
    now: Date,
    expectedProcessingGeneration: number,
  ): Promise<ReviewRecord | null> {
    const persisted = validatePersistedAiReviewExecution(execution);

    return this.prisma.transaction(async (transaction) => {
      const transitioned = await transaction.review.updateMany({
        data: { status: "COMPLETED", updatedAt: now },
        where: {
          deletedAt: null,
          id,
          processingGeneration: expectedProcessingGeneration,
          status: "PROCESSING",
          userId,
        },
      });

      if (transitioned.count !== 1) {
        return null;
      }

      await transaction.reviewResult.create({
        data: {
          attempts: persisted.attempts,
          durationMs: persisted.durationMs,
          model: persisted.model,
          provider: persisted.provider,
          reasoningEffort: persisted.reasoningEffort,
          result: persisted.result as Prisma.InputJsonValue,
          reviewId: id,
          ...(persisted.usage === undefined
            ? {}
            : {
                usage: {
                  create: {
                    ...(persisted.usage.cachedInputTokens === undefined
                      ? {}
                      : { cachedInputTokens: persisted.usage.cachedInputTokens }),
                    inputTokens: persisted.usage.inputTokens,
                    outputTokens: persisted.usage.outputTokens,
                    totalTokens: persisted.usage.totalTokens,
                  },
                },
              }),
        },
      });

      const review = await transaction.review.findFirst({
        where: {
          deletedAt: null,
          id,
          processingGeneration: expectedProcessingGeneration,
          status: "COMPLETED",
          userId,
        },
      });

      return review ? mapReview(review) : null;
    });
  }

  async fenceProcessingForUser(
    userId: string,
    id: string,
    now: Date,
    expectedProcessingGeneration: number,
  ): Promise<ReviewRecord | null> {
    return this.prisma.transaction(async (transaction) => {
      const fenced = await transaction.review.updateMany({
        data: { status: "CANCELLED", updatedAt: now },
        where: {
          deletedAt: null,
          id,
          processingGeneration: expectedProcessingGeneration,
          status: "PROCESSING",
          userId,
        },
      });

      if (fenced.count !== 1) {
        return null;
      }

      const review = await transaction.review.findFirst({
        where: {
          deletedAt: null,
          id,
          processingGeneration: expectedProcessingGeneration,
          status: "CANCELLED",
          userId,
        },
      });

      return review ? mapReview(review) : null;
    });
  }

  async findResultForUser(userId: string, id: string): Promise<ReviewResultRecord | null> {
    const result = await this.prisma.reviewResult.findFirst({
      include: { usage: true },
      where: {
        review: { deletedAt: null, id, status: "COMPLETED", userId },
      },
    });

    return result ? mapReviewResult(result) : null;
  }
}
