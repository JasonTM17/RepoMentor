import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AiReviewExecution } from "../../src/modules/ai/ai.types.js";
import type { ReviewResult } from "../../src/modules/ai/review-result.schema.js";
import { InMemoryReviewRepository } from "../../src/modules/review/in-memory-review.repository.js";
import {
  ReviewPersistenceBoundaryError,
  validatePersistedAiReviewExecution,
} from "../../src/modules/review/review-result.persistence.js";

const OWNER_ID = "review-result-owner";
const OTHER_USER_ID = "review-result-other";
const REVIEW_ID = "review-result-1";
const NOW = new Date("2026-08-06T01:00:00.000Z");
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

describe("persisted AI review execution contract", () => {
  it("accepts the exact bounded Luna execution and normalizes a safe value", () => {
    assert.deepEqual(validatePersistedAiReviewExecution(EXECUTION), EXECUTION);
  });

  it("rejects inconsistent usage and provider metadata", () => {
    assert.throws(
      () =>
        validatePersistedAiReviewExecution({
          ...EXECUTION,
          provider: "other",
        }),
      (error: unknown) => {
        assert.ok(error instanceof ReviewPersistenceBoundaryError);
        assert.equal(error.code, "INVALID_EXECUTION");
        return true;
      },
    );
    assert.throws(
      () =>
        validatePersistedAiReviewExecution({
          ...EXECUTION,
          usage: { inputTokens: 12, outputTokens: 8, totalTokens: 19 },
        }),
      (error: unknown) => error instanceof ReviewPersistenceBoundaryError,
    );
  });

  it("keeps finalization and result reads owner-scoped and idempotent", async () => {
    const repository = new InMemoryReviewRepository();
    await repository.create({
      id: REVIEW_ID,
      language: "typescript",
      mode: "DEEP",
      learnerLevel: "INTERMEDIATE",
      source: "const answer = 42;",
      userId: OWNER_ID,
    });
    const claimed = await repository.transitionForUser(OWNER_ID, REVIEW_ID, {
      fromStatuses: ["PENDING"],
      now: NOW,
      toStatus: "PROCESSING",
    });
    assert.equal(claimed?.processingGeneration, 1);
    assert.equal(
      await repository.transitionForUser(OWNER_ID, REVIEW_ID, {
        fromStatuses: ["PROCESSING"],
        now: NOW,
        toStatus: "COMPLETED",
      }),
      null,
    );

    assert.equal(
      await repository.finalizeForUser(
        OTHER_USER_ID,
        REVIEW_ID,
        EXECUTION,
        NOW,
        claimed?.processingGeneration ?? 0,
      ),
      null,
    );
    assert.equal((await repository.findByIdForUser(OWNER_ID, REVIEW_ID))?.status, "PROCESSING");

    const completed = await repository.finalizeForUser(
      OWNER_ID,
      REVIEW_ID,
      EXECUTION,
      NOW,
      claimed?.processingGeneration ?? 0,
    );
    assert.equal(completed?.status, "COMPLETED");
    const persisted = await repository.findResultForUser(OWNER_ID, REVIEW_ID);
    assert.ok(persisted);
    assert.equal(await repository.findResultForUser(OTHER_USER_ID, REVIEW_ID), null);

    const duplicate = await repository.finalizeForUser(
      OWNER_ID,
      REVIEW_ID,
      { ...EXECUTION, durationMs: 999 },
      new Date(NOW.getTime() + 1_000),
      claimed?.processingGeneration ?? 0,
    );
    assert.equal(duplicate, null);
    assert.equal((await repository.findResultForUser(OWNER_ID, REVIEW_ID))?.durationMs, 42);
    assert.deepEqual(persisted.usage, { inputTokens: 12, outputTokens: 8, totalTokens: 20 });
  });
});
