import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../auth/prisma.service.js";
import type {
  UsageCountByLanguage,
  UsageCountByMode,
  UsageCountByStatus,
  UsageHistoryListInput,
  UsageHistoryListResult,
  UsageHistoryRecord,
  UsageRepository,
  UsageSummaryAggregate,
  UsageTokenRecord,
} from "./usage.types.js";

const historySelect = {
  createdAt: true,
  id: true,
  language: true,
  mode: true,
  result: {
    select: {
      durationMs: true,
      usage: {
        select: {
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
        },
      },
    },
  },
  status: true,
} satisfies Prisma.ReviewSelect;

type HistoryRow = Prisma.ReviewGetPayload<{ select: typeof historySelect }>;

function mapHistoryRow(row: HistoryRow): UsageHistoryRecord {
  return {
    createdAt: row.createdAt,
    language: row.language,
    mode: row.mode,
    result:
      row.result === null
        ? null
        : {
            durationMs: row.result.durationMs,
            usage:
              row.result.usage === null
                ? null
                : {
                    inputTokens: row.result.usage.inputTokens,
                    outputTokens: row.result.usage.outputTokens,
                    totalTokens: row.result.usage.totalTokens,
                  },
          },
    reviewId: row.id,
    status: row.status,
  };
}

function mapStatusCounts(
  rows: readonly { readonly status: string; readonly _count: { readonly _all: number } }[],
): UsageCountByStatus[] {
  return rows.map((row) => ({
    count: row._count._all,
    status: row.status as UsageCountByStatus["status"],
  }));
}

function mapLanguageCounts(
  rows: readonly { readonly language: string; readonly _count: { readonly _all: number } }[],
): UsageCountByLanguage[] {
  return rows.map((row) => ({ count: row._count._all, language: row.language }));
}

function mapModeCounts(
  rows: readonly { readonly mode: string; readonly _count: { readonly _all: number } }[],
): UsageCountByMode[] {
  return rows.map((row) => ({
    count: row._count._all,
    mode: row.mode as UsageCountByMode["mode"],
  }));
}

function mapTokenTotals(totals: {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
}): UsageTokenRecord {
  return {
    inputTokens: totals.inputTokens ?? 0,
    outputTokens: totals.outputTokens ?? 0,
    totalTokens: totals.totalTokens ?? 0,
  };
}

@Injectable()
export class PrismaUsageRepository implements UsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getSummaryForUser(userId: string): Promise<UsageSummaryAggregate> {
    const ownedReviewWhere: Prisma.ReviewWhereInput = {
      deletedAt: null,
      userId,
    };
    const completedReviewWhere: Prisma.ReviewWhereInput = {
      ...ownedReviewWhere,
      status: "COMPLETED",
    };
    const usageWhere: Prisma.ReviewUsageWhereInput = {
      reviewResult: {
        review: completedReviewWhere,
      },
    };

    const [totalReviews, statusCounts, languageCounts, completedReviews, deepReviews, tokenTotals] =
      await Promise.all([
        this.prisma.review.count({ where: ownedReviewWhere }),
        this.prisma.review.groupBy({
          _count: { _all: true },
          by: ["status"],
          where: ownedReviewWhere,
        }),
        this.prisma.review.groupBy({
          _count: { _all: true },
          by: ["language"],
          where: ownedReviewWhere,
        }),
        this.prisma.review.count({ where: completedReviewWhere }),
        this.prisma.review.count({ where: { ...ownedReviewWhere, mode: "DEEP" } }),
        this.prisma.reviewUsage.aggregate({
          _sum: {
            inputTokens: true,
            outputTokens: true,
            totalTokens: true,
          },
          where: usageWhere,
        }),
      ]);

    return {
      completedReviews,
      deepReviews,
      languageCounts: mapLanguageCounts(languageCounts),
      statusCounts: mapStatusCounts(statusCounts),
      tokenTotals: mapTokenTotals(tokenTotals._sum),
      totalReviews,
    };
  }

  async listHistoryForUser(input: UsageHistoryListInput): Promise<UsageHistoryListResult> {
    const where: Prisma.ReviewWhereInput = {
      deletedAt: null,
      userId: input.userId,
    };
    const [total, rows] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: historySelect,
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        where,
      }),
    ]);

    return {
      items: rows.map(mapHistoryRow),
      total,
    };
  }

  async countReviewsForUserOnUtcDay(input: {
    readonly userId: string;
    readonly start: Date;
    readonly endExclusive: Date;
  }): Promise<readonly UsageCountByMode[]> {
    const rows = await this.prisma.review.groupBy({
      _count: { _all: true },
      by: ["mode"],
      where: {
        createdAt: { gte: input.start, lt: input.endExclusive },
        userId: input.userId,
      },
    });

    return mapModeCounts(rows);
  }
}
