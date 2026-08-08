import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PrismaService } from "../../src/modules/auth/prisma.service.js";
import { PrismaUsageRepository } from "../../src/modules/usage/prisma-usage.repository.js";

const OWNER_ID = "usage-owner";
const NOW = new Date("2026-08-06T02:00:00.000Z");

describe("Prisma usage repository", () => {
  it("keeps summary aggregates and usage sums owner-scoped", async () => {
    const summaryWhere: unknown[] = [];
    let usageWhere: unknown;
    const prisma = {
      review: {
        count: async (args: { readonly where: unknown }) => {
          summaryWhere.push(args.where);
          const where = args.where as { readonly mode?: string; readonly status?: string };
          if (where.mode === "DEEP") {
            return 2;
          }

          if (where.status === "COMPLETED") {
            return 1;
          }

          return 3;
        },
        groupBy: async (args: { readonly by: readonly string[] }) => {
          if (args.by[0] === "status") {
            return [{ _count: { _all: 1 }, status: "COMPLETED" }];
          }

          return [{ _count: { _all: 3 }, language: "typescript" }];
        },
      },
      reviewUsage: {
        aggregate: async (args: { readonly where: unknown }) => {
          usageWhere = args.where;
          return {
            _sum: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          };
        },
        findMany: async () => [{ estimatedCostMicros: null, pricingVersion: null }],
      },
    } as unknown as PrismaService;
    const repository = new PrismaUsageRepository(prisma);

    const summary = await repository.getSummaryForUser(OWNER_ID);

    assert.equal(summary.totalReviews, 3);
    assert.equal(summary.completedReviews, 1);
    assert.equal(summary.deepReviews, 2);
    assert.deepEqual(summary.cost, {
      estimatedCostMicros: null,
      pricingVersion: null,
      status: "UNAVAILABLE",
    });
    assert.deepEqual(summary.tokenTotals, {
      estimatedCostMicros: null,
      inputTokens: 10,
      outputTokens: 20,
      pricingVersion: null,
      totalTokens: 30,
    });
    for (const where of summaryWhere) {
      assert.equal((where as { readonly userId?: string }).userId, OWNER_ID);
    }
    assert.deepEqual(
      (usageWhere as { readonly reviewResult: { readonly review: unknown } }).reviewResult.review,
      { deletedAt: null, status: "COMPLETED", userId: OWNER_ID },
    );
  });

  it("selects only source-free history fields and applies stable owner pagination", async () => {
    let countWhere: unknown;
    let findManyArgs: Record<string, unknown> | undefined;
    const prisma = {
      review: {
        count: async (args: { readonly where: unknown }) => {
          countWhere = args.where;
          return 4;
        },
        findMany: async (args: Record<string, unknown>) => {
          findManyArgs = args;
          return [
            {
              createdAt: NOW,
              id: "owned-review",
              language: "TypeScript",
              mode: "STANDARD",
              result: {
                durationMs: 42,
                usage: {
                  cachedInputTokens: null,
                  estimatedCostMicros: null,
                  inputTokens: 10,
                  outputTokens: 20,
                  pricingVersion: null,
                  totalTokens: 30,
                },
              },
              source: "must never be selected",
              status: "COMPLETED",
            },
          ];
        },
      },
    } as unknown as PrismaService;
    const repository = new PrismaUsageRepository(prisma);

    const history = await repository.listHistoryForUser({
      limit: 2,
      page: 3,
      sort: "desc",
      userId: OWNER_ID,
    });

    assert.equal((countWhere as { readonly userId?: string }).userId, OWNER_ID);
    assert.deepEqual(history.items, [
      {
        createdAt: NOW,
        language: "TypeScript",
        mode: "STANDARD",
        result: {
          durationMs: 42,
          usage: {
            estimatedCostMicros: null,
            inputTokens: 10,
            outputTokens: 20,
            pricingVersion: null,
            totalTokens: 30,
          },
        },
        reviewId: "owned-review",
        status: "COMPLETED",
      },
    ]);
    assert.equal(history.total, 4);
    assert.equal((findManyArgs?.select as Record<string, unknown>).source, undefined);
    assert.equal(findManyArgs?.skip, 4);
    assert.equal(findManyArgs?.take, 2);
    assert.deepEqual(findManyArgs?.where, { deletedAt: null, userId: OWNER_ID });
    assert.deepEqual(findManyArgs?.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  });

  it("composes every history filter and preserves literal underscore search semantics", async () => {
    let countWhere: unknown;
    let findManyArgs: Record<string, unknown> | undefined;
    const from = new Date("2026-08-06T00:00:00.000Z");
    const to = new Date("2026-08-07T00:00:00.000Z");
    const prisma = {
      review: {
        count: async (args: { readonly where: unknown }) => {
          countWhere = args.where;
          return 1;
        },
        findMany: async (args: Record<string, unknown>) => {
          findManyArgs = args;
          return [];
        },
      },
    } as unknown as PrismaService;
    const repository = new PrismaUsageRepository(prisma);

    await repository.listHistoryForUser({
      from,
      language: "typescript",
      limit: 5,
      mode: "DEEP",
      page: 2,
      search: "review_id",
      sort: "asc",
      status: "COMPLETED",
      to,
      userId: OWNER_ID,
    });

    const expectedWhere = {
      createdAt: { gte: from, lt: to },
      deletedAt: null,
      id: { contains: "review\\_id", mode: "insensitive" },
      language: "typescript",
      mode: "DEEP",
      status: "COMPLETED",
      userId: OWNER_ID,
    };
    assert.deepEqual(countWhere, expectedWhere);
    assert.deepEqual(findManyArgs?.where, expectedWhere);
    assert.deepEqual(findManyArgs?.orderBy, [{ createdAt: "asc" }, { id: "asc" }]);
    assert.equal(findManyArgs?.skip, 5);
    assert.equal(findManyArgs?.take, 5);
  });

  it("counts every owned review in the explicit UTC range for quota reads", async () => {
    let groupByArgs: { readonly by: readonly string[]; readonly where: unknown } | undefined;
    const prisma = {
      review: {
        groupBy: async (args: { readonly by: readonly string[]; readonly where: unknown }) => {
          groupByArgs = args;
          return [{ _count: { _all: 2 }, mode: "QUICK" }];
        },
      },
    } as unknown as PrismaService;
    const repository = new PrismaUsageRepository(prisma);
    const start = new Date("2026-08-06T00:00:00.000Z");
    const endExclusive = new Date("2026-08-07T00:00:00.000Z");

    const counts = await repository.countReviewsForUserOnUtcDay({
      endExclusive,
      start,
      userId: OWNER_ID,
    });

    assert.deepEqual(counts, [{ count: 2, mode: "QUICK" }]);
    assert.deepEqual(groupByArgs?.by, ["mode"]);
    assert.deepEqual(groupByArgs?.where, {
      createdAt: { gte: start, lt: endExclusive },
      userId: OWNER_ID,
    });
  });
});
