import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Prisma, Review as PrismaReview } from "@prisma/client";

import type { AiReviewExecution } from "../../src/modules/ai/ai.types.js";
import type { ReviewResult } from "../../src/modules/ai/review-result.schema.js";
import { PrismaService } from "../../src/modules/auth/prisma.service.js";
import { PrismaReviewRepository } from "../../src/modules/review/prisma-review.repository.js";

const USER_ID = "prisma-result-owner";
const REVIEW_ID = "prisma-result-1";
const NOW = new Date("2026-08-06T02:00:00.000Z");
const EXPECTED_GENERATION = 1;
const EXECUTION: AiReviewExecution<ReviewResult> = {
  attempts: 1,
  durationMs: 42,
  model: "gpt-5.6-luna",
  provider: "luna",
  reasoningEffort: "max",
  result: {
    education: {
      diff: null,
      generatedTests: [],
      improvedSource: null,
      learningQuestions: [],
    },
    findings: [],
    schemaVersion: "v1",
    summary: "No actionable findings were detected.",
  },
  usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
};

function reviewRow(
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "CANCELLED",
  processingGeneration = EXPECTED_GENERATION,
  eventSequence = 1,
): PrismaReview {
  return {
    createdAt: NOW,
    deletedAt: null,
    id: REVIEW_ID,
    language: "typescript",
    mode: "STANDARD",
    eventSequence,
    processingGeneration,
    source: "const answer = 42;",
    status,
    updatedAt: NOW,
    userId: USER_ID,
  };
}

function createRepository(options: { readonly failResultInsert?: Error } = {}) {
  let status: "PROCESSING" | "COMPLETED" | "CANCELLED" = "PROCESSING";
  let eventSequence = 1;
  let resultInserted = false;
  const events: string[] = [];
  const persistedEvents: unknown[] = [];
  let lastUpdateWhere: unknown;

  const transactionClient = {
    review: {
      findFirst: async () => reviewRow(status, EXPECTED_GENERATION, eventSequence),
      updateMany: async (args: {
        readonly data: {
          readonly eventSequence?: { readonly increment?: number };
          readonly status: string;
        };
        readonly where: unknown;
      }) => {
        lastUpdateWhere = args.where;
        events.push(`review.updateMany:${args.data.status}`);
        if (
          status !== "PROCESSING" ||
          (args.where as { readonly processingGeneration?: number }).processingGeneration !==
            EXPECTED_GENERATION
        ) {
          return { count: 0 };
        }

        status = args.data.status === "CANCELLED" ? "CANCELLED" : "COMPLETED";
        eventSequence += args.data.eventSequence?.increment ?? 0;
        return { count: 1 };
      },
    },
    reviewEvent: {
      create: async (args: { readonly data: Record<string, unknown> }) => {
        events.push("reviewEvent.create");
        persistedEvents.push(args.data);
        assert.equal(args.data.sequence, eventSequence);
        return {};
      },
    },
    reviewResult: {
      create: async (args: { readonly data: Record<string, unknown> }) => {
        events.push("reviewResult.create");
        if (options.failResultInsert) {
          throw options.failResultInsert;
        }

        assert.equal(args.data.reviewId, REVIEW_ID);
        assert.deepEqual(args.data.usage, {
          create: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
        });
        resultInserted = true;
        return {};
      },
    },
  } as unknown as Prisma.TransactionClient;

  const prisma = {
    transaction: async <T>(callback: (client: Prisma.TransactionClient) => Promise<T>) => {
      events.push("transaction:start");
      const previousStatus = status;
      const previousEventSequence = eventSequence;
      const previousResult = resultInserted;
      const previousEventCount = persistedEvents.length;

      try {
        const result = await callback(transactionClient);
        events.push("transaction:commit");
        return result;
      } catch (error: unknown) {
        status = previousStatus;
        eventSequence = previousEventSequence;
        resultInserted = previousResult;
        persistedEvents.length = previousEventCount;
        events.push("transaction:rollback");
        throw error;
      }
    },
  } as unknown as PrismaService;

  return {
    events,
    get resultInserted() {
      return resultInserted;
    },
    get status() {
      return status;
    },
    persistedEvents,
    get lastUpdateWhere() {
      return lastUpdateWhere;
    },
    repository: new PrismaReviewRepository(prisma),
  };
}

function createClaimRepository() {
  let status: "PENDING" | "PROCESSING" = "PENDING";
  let processingGeneration = 0;
  let eventSequence = 1;
  const events: string[] = [];
  let lastUpdateData: unknown;
  let lastUpdateWhere: unknown;

  const transactionClient = {
    review: {
      findFirst: async () => reviewRow(status, processingGeneration, eventSequence),
      updateMany: async (args: { readonly data: unknown; readonly where: unknown }) => {
        lastUpdateData = args.data;
        lastUpdateWhere = args.where;
        events.push("review.updateMany:PROCESSING");
        if (status !== "PENDING") {
          return { count: 0 };
        }

        processingGeneration +=
          (args.data as { readonly processingGeneration?: { readonly increment?: number } })
            .processingGeneration?.increment ?? 0;
        eventSequence +=
          (args.data as { readonly eventSequence?: { readonly increment?: number } }).eventSequence
            ?.increment ?? 0;
        status = "PROCESSING";
        return { count: 1 };
      },
    },
    reviewEvent: {
      create: async (args: { readonly data: Record<string, unknown> }) => {
        events.push("reviewEvent.create");
        assert.equal(args.data.sequence, eventSequence);
        return {};
      },
    },
  } as unknown as Prisma.TransactionClient;

  const prisma = {
    transaction: async <T>(callback: (client: Prisma.TransactionClient) => Promise<T>) => {
      events.push("transaction:start");
      const previousStatus = status;
      const previousGeneration = processingGeneration;
      const previousEventSequence = eventSequence;

      try {
        const result = await callback(transactionClient);
        events.push("transaction:commit");
        return result;
      } catch (error: unknown) {
        status = previousStatus;
        processingGeneration = previousGeneration;
        eventSequence = previousEventSequence;
        events.push("transaction:rollback");
        throw error;
      }
    },
  } as unknown as PrismaService;

  return {
    events,
    get lastUpdateData() {
      return lastUpdateData;
    },
    get lastUpdateWhere() {
      return lastUpdateWhere;
    },
    get processingGeneration() {
      return processingGeneration;
    },
    get status() {
      return status;
    },
    repository: new PrismaReviewRepository(prisma),
  };
}

describe("Prisma review result finalization", () => {
  it("conditionally completes the owner review and writes result plus usage in one transaction", async () => {
    const fixture = createRepository();

    const completed = await fixture.repository.finalizeForUser(
      USER_ID,
      REVIEW_ID,
      EXECUTION,
      NOW,
      EXPECTED_GENERATION,
    );

    assert.equal(completed?.status, "COMPLETED");
    assert.equal(fixture.status, "COMPLETED");
    assert.equal(fixture.resultInserted, true);
    assert.equal(
      (fixture.lastUpdateWhere as { readonly processingGeneration?: number }).processingGeneration,
      EXPECTED_GENERATION,
    );
    assert.deepEqual(fixture.events, [
      "transaction:start",
      "review.updateMany:COMPLETED",
      "reviewResult.create",
      "reviewEvent.create",
      "transaction:commit",
    ]);
  });

  it("fences the owned processing generation before a delayed finalization can write", async () => {
    const fixture = createRepository();

    const fenced = await fixture.repository.fenceProcessingForUser(
      USER_ID,
      REVIEW_ID,
      NOW,
      EXPECTED_GENERATION,
    );

    assert.equal(fenced?.status, "CANCELLED");
    assert.equal(fixture.status, "CANCELLED");
    assert.equal(
      await fixture.repository.finalizeForUser(
        USER_ID,
        REVIEW_ID,
        EXECUTION,
        NOW,
        EXPECTED_GENERATION,
      ),
      null,
    );
    assert.equal(fixture.resultInserted, false);
    assert.deepEqual(fixture.events, [
      "transaction:start",
      "review.updateMany:CANCELLED",
      "reviewEvent.create",
      "transaction:commit",
      "transaction:start",
      "review.updateMany:COMPLETED",
      "transaction:commit",
    ]);
  });

  it("rolls the conditional status change back when result persistence fails", async () => {
    const insertError = new Error("result insert failed");
    const fixture = createRepository({ failResultInsert: insertError });

    await assert.rejects(
      fixture.repository.finalizeForUser(USER_ID, REVIEW_ID, EXECUTION, NOW, EXPECTED_GENERATION),
      (error: unknown) => {
        assert.equal(error, insertError);
        return true;
      },
    );

    assert.equal(fixture.status, "PROCESSING");
    assert.equal(fixture.resultInserted, false);
    assert.deepEqual(fixture.events, [
      "transaction:start",
      "review.updateMany:COMPLETED",
      "reviewResult.create",
      "transaction:rollback",
    ]);
  });

  it("rejects a stale generation without writing a result", async () => {
    const fixture = createRepository();

    const completed = await fixture.repository.finalizeForUser(
      USER_ID,
      REVIEW_ID,
      EXECUTION,
      NOW,
      EXPECTED_GENERATION - 1,
    );

    assert.equal(completed, null);
    assert.equal(fixture.status, "PROCESSING");
    assert.equal(fixture.resultInserted, false);
    assert.deepEqual(fixture.events, [
      "transaction:start",
      "review.updateMany:COMPLETED",
      "transaction:commit",
    ]);
  });
});

describe("Prisma review processing claims", () => {
  it("increments and returns the generation inside the claim transaction", async () => {
    const fixture = createClaimRepository();

    const claimed = await fixture.repository.transitionForUser(USER_ID, REVIEW_ID, {
      fromStatuses: ["PENDING"],
      now: NOW,
      toStatus: "PROCESSING",
    });

    assert.equal(claimed?.status, "PROCESSING");
    assert.equal(claimed?.processingGeneration, 1);
    assert.equal(fixture.status, "PROCESSING");
    assert.equal(fixture.processingGeneration, 1);
    assert.deepEqual(
      (fixture.lastUpdateData as { readonly processingGeneration?: unknown }).processingGeneration,
      { increment: 1 },
    );
    const where = fixture.lastUpdateWhere as {
      readonly AND?: readonly [{ readonly processingGeneration?: { readonly lt?: number } }];
    };
    assert.equal(where.AND?.[0]?.processingGeneration?.lt, 2_147_483_646);
    assert.deepEqual(fixture.events, [
      "transaction:start",
      "review.updateMany:PROCESSING",
      "reviewEvent.create",
      "transaction:commit",
    ]);
  });
});
