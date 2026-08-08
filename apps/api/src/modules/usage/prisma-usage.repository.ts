import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../auth/prisma.service.js";
import { toPersistedAiUsageRecordFromStorage } from "../review/review-result.persistence.js";
import type {
  UsageCountByLanguage,
  UsageCountByMode,
  UsageCountByStatus,
  UsageCostAggregate,
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
          cachedInputTokens: true,
          estimatedCostMicros: true,
          inputTokens: true,
          outputTokens: true,
          pricingVersion: true,
          totalTokens: true,
        },
      },
    },
  },
  status: true,
} satisfies Prisma.ReviewSelect;

type HistoryRow = Prisma.ReviewGetPayload<{ select: typeof historySelect }>;
type StoredUsageRow = {
  readonly cachedInputTokens: number | null;
  readonly estimatedCostMicros: bigint | number | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly pricingVersion: string | null;
  readonly totalTokens: number;
};
type StoredCostRow = Pick<StoredUsageRow, "estimatedCostMicros" | "pricingVersion">;

const PRICING_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const MAX_SAFE_COST_MICROS = BigInt(Number.MAX_SAFE_INTEGER);

function escapePrismaLikeSearch(value: string): string {
  return value.replaceAll("_", "\\_");
}

function getHistoryWhere(input: UsageHistoryListInput): Prisma.ReviewWhereInput {
  return {
    ...(input.from || input.to
      ? {
          createdAt: {
            ...(input.from ? { gte: input.from } : {}),
            ...(input.to ? { lt: input.to } : {}),
          },
        }
      : {}),
    ...(input.language ? { language: input.language } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.search
      ? {
          id: {
            contains: escapePrismaLikeSearch(input.search),
            mode: "insensitive" as const,
          },
        }
      : {}),
    ...(input.status ? { status: input.status } : {}),
    deletedAt: null,
    userId: input.userId,
  };
}

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
            usage: row.result.usage === null ? null : mapStoredUsage(row.result.usage),
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

function mapStoredUsage(row: StoredUsageRow): UsageTokenRecord {
  const persisted = toPersistedAiUsageRecordFromStorage(row);

  return {
    estimatedCostMicros: persisted.estimatedCostMicros,
    inputTokens: persisted.inputTokens,
    outputTokens: persisted.outputTokens,
    pricingVersion: persisted.pricingVersion,
    totalTokens: persisted.totalTokens,
  };
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
    estimatedCostMicros: null,
    inputTokens: totals.inputTokens ?? 0,
    outputTokens: totals.outputTokens ?? 0,
    pricingVersion: null,
    totalTokens: totals.totalTokens ?? 0,
  };
}

function toSafeCostMicros(value: bigint | number | null): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value === "bigint") {
    return value >= 0n && value <= MAX_SAFE_COST_MICROS ? Number(value) : null;
  }

  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function mapCostAggregate(rows: readonly StoredCostRow[]): UsageCostAggregate {
  let knownCostRows = 0;
  let unknownCostRows = 0;
  let totalCostMicros = 0n;
  const pricingVersions = new Set<string>();

  for (const row of rows) {
    const estimatedCostMicros = toSafeCostMicros(row.estimatedCostMicros);
    const pricingVersion =
      typeof row.pricingVersion === "string" && PRICING_VERSION_PATTERN.test(row.pricingVersion)
        ? row.pricingVersion
        : null;

    if (estimatedCostMicros === null || pricingVersion === null) {
      unknownCostRows += 1;
      continue;
    }

    knownCostRows += 1;
    pricingVersions.add(pricingVersion);
    totalCostMicros += BigInt(estimatedCostMicros);
  }

  if (knownCostRows === 0) {
    return { estimatedCostMicros: null, pricingVersion: null, status: "UNAVAILABLE" };
  }

  if (unknownCostRows > 0 || pricingVersions.size !== 1) {
    return { estimatedCostMicros: null, pricingVersion: null, status: "MIXED" };
  }

  const pricingVersion = [...pricingVersions][0];
  if (pricingVersion === undefined || totalCostMicros > MAX_SAFE_COST_MICROS) {
    return { estimatedCostMicros: null, pricingVersion: null, status: "UNAVAILABLE" };
  }

  return {
    estimatedCostMicros: Number(totalCostMicros),
    pricingVersion,
    status: "AVAILABLE",
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

    const [
      totalReviews,
      statusCounts,
      languageCounts,
      completedReviews,
      deepReviews,
      tokenTotals,
      costRows,
    ] = await Promise.all([
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
      this.prisma.reviewUsage.findMany({
        select: { estimatedCostMicros: true, pricingVersion: true },
        where: usageWhere,
      }),
    ]);

    return {
      completedReviews,
      cost: mapCostAggregate(costRows),
      deepReviews,
      languageCounts: mapLanguageCounts(languageCounts),
      statusCounts: mapStatusCounts(statusCounts),
      tokenTotals: mapTokenTotals(tokenTotals._sum),
      totalReviews,
    };
  }

  async listHistoryForUser(input: UsageHistoryListInput): Promise<UsageHistoryListResult> {
    const where = getHistoryWhere(input);
    const sort = input.sort === "asc" ? "asc" : "desc";
    const [total, rows] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        orderBy: [{ createdAt: sort }, { id: sort }],
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
