import { Injectable } from "@nestjs/common";
import type { Prisma, Review as PrismaReview } from "@prisma/client";

import { PrismaService } from "../auth/prisma.service.js";
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
    source: row.source,
    status: row.status,
    updatedAt: row.updatedAt,
    userId: row.userId,
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
    const result = await this.prisma.review.updateMany({
      data: { status: transition.toStatus },
      where: {
        deletedAt: null,
        id,
        status: { in: [...transition.fromStatuses] },
        userId,
      },
    });

    if (result.count !== 1) {
      return null;
    }

    return this.findByIdForUser(userId, id);
  }
}
