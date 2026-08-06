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
const EXECUTION: AiReviewExecution<ReviewResult> = {
  attempts: 1,
  durationMs: 42,
  model: "gpt-5.6-luna",
  provider: "luna",
  reasoningEffort: "max",
  result: {
    findings: [],
    schemaVersion: "v1",
    summary: "No actionable findings were detected.",
  },
  usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
};

function reviewRow(status: "PROCESSING" | "COMPLETED"): PrismaReview {
  return {
    createdAt: NOW,
    deletedAt: null,
    id: REVIEW_ID,
    language: "typescript",
    mode: "STANDARD",
    source: "const answer = 42;",
    status,
    updatedAt: NOW,
    userId: USER_ID,
  };
}

function createRepository(options: { readonly failResultInsert?: Error } = {}) {
  let status: "PROCESSING" | "COMPLETED" = "PROCESSING";
  let resultInserted = false;
  const events: string[] = [];

  const transactionClient = {
    review: {
      findFirst: async () => reviewRow(status),
      updateMany: async (args: { readonly data: { readonly status: string } }) => {
        events.push(`review.updateMany:${args.data.status}`);
        if (status !== "PROCESSING") {
          return { count: 0 };
        }

        status = "COMPLETED";
        return { count: 1 };
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
      const previousResult = resultInserted;

      try {
        const result = await callback(transactionClient);
        events.push("transaction:commit");
        return result;
      } catch (error: unknown) {
        status = previousStatus;
        resultInserted = previousResult;
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
    repository: new PrismaReviewRepository(prisma),
  };
}

describe("Prisma review result finalization", () => {
  it("conditionally completes the owner review and writes result plus usage in one transaction", async () => {
    const fixture = createRepository();

    const completed = await fixture.repository.finalizeForUser(USER_ID, REVIEW_ID, EXECUTION, NOW);

    assert.equal(completed?.status, "COMPLETED");
    assert.equal(fixture.status, "COMPLETED");
    assert.equal(fixture.resultInserted, true);
    assert.deepEqual(fixture.events, [
      "transaction:start",
      "review.updateMany:COMPLETED",
      "reviewResult.create",
      "transaction:commit",
    ]);
  });

  it("rolls the conditional status change back when result persistence fails", async () => {
    const insertError = new Error("result insert failed");
    const fixture = createRepository({ failResultInsert: insertError });

    await assert.rejects(
      fixture.repository.finalizeForUser(USER_ID, REVIEW_ID, EXECUTION, NOW),
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
});
