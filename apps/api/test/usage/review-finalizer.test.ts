import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  InMemoryReviewFinalizer,
  type SeedReservedAdmission,
} from "../../src/modules/usage/in-memory-review-finalizer.js";
import {
  ReviewFinalizerConflictError,
  ReviewFinalizerIndeterminateError,
  ReviewFinalizerNotFoundError,
  ReviewFinalizerUnavailableError,
} from "../../src/modules/usage/review-finalizer.errors.js";
import type { FinalizeReviewInput } from "../../src/modules/usage/review-finalizer.types.js";

const NOW = new Date("2026-08-07T01:00:00.000Z");
const OWNER = "owner-a";
const ADMISSION_ID = "admission-a";
const REVIEW_ID = "review-a";

const RESERVED: SeedReservedAdmission = {
  id: ADMISSION_ID,
  mode: "STANDARD",
  reviewId: REVIEW_ID,
  updatedAt: NOW,
  userId: OWNER,
};

function input(overrides: Partial<FinalizeReviewInput> = {}): FinalizeReviewInput {
  return {
    admissionId: ADMISSION_ID,
    language: "typescript",
    mode: "STANDARD",
    now: NOW,
    reviewId: REVIEW_ID,
    source: "const answer = 42;",
    userId: OWNER,
    ...overrides,
  };
}

describe("review finalizer contract seam", () => {
  it("creates the exact preallocated review and admits the owner-scoped reservation", async () => {
    const finalizer = new InMemoryReviewFinalizer();
    finalizer.seedReservedAdmission(RESERVED);

    const result = await finalizer.finalize(input());

    assert.equal(result.kind, "FINALIZED");
    assert.deepEqual(result.summary, {
      createdAt: NOW,
      id: REVIEW_ID,
      language: "typescript",
      mode: "STANDARD",
      status: "PENDING",
      updatedAt: NOW,
    });
    assert.equal("source" in result.summary, false);
    assert.equal(JSON.stringify(result).includes("const answer"), false);
    assert.equal(finalizer.findAdmission(OWNER, ADMISSION_ID)?.status, "ADMITTED");
    assert.equal(finalizer.findSummary(OWNER, REVIEW_ID)?.id, REVIEW_ID);
  });

  it("replays ADMITTED owner requests without creating a second review", async () => {
    const finalizer = new InMemoryReviewFinalizer();
    finalizer.seedReservedAdmission(RESERVED);

    const first = await finalizer.finalize(input());
    const replay = await finalizer.finalize(
      input({ language: "javascript", source: "different source is ignored on replay" }),
    );

    assert.equal(first.kind, "FINALIZED");
    assert.equal(replay.kind, "REPLAYED");
    assert.deepEqual(replay.summary, first.summary);
    assert.equal(finalizer.findAdmission(OWNER, ADMISSION_ID)?.status, "ADMITTED");
  });

  it("rejects cross-owner and wrong-review finalization without identifiers", async () => {
    const finalizer = new InMemoryReviewFinalizer();
    finalizer.seedReservedAdmission(RESERVED);

    await assert.rejects(finalizer.finalize(input({ userId: "owner-b" })), (error: unknown) => {
      assert.ok(error instanceof ReviewFinalizerNotFoundError);
      assert.equal(error.message.includes(OWNER), false);
      assert.equal(error.message.includes(ADMISSION_ID), false);
      assert.equal(error.message.includes(REVIEW_ID), false);
      return true;
    });

    await assert.rejects(
      finalizer.finalize(input({ reviewId: "review-other" })),
      (error: unknown) => {
        assert.ok(error instanceof ReviewFinalizerConflictError);
        assert.equal(error.message.includes("review-other"), false);
        return true;
      },
    );

    const denied = new InMemoryReviewFinalizer();
    denied.seedDeniedAdmission(RESERVED);
    await assert.rejects(denied.finalize(input()), (error: unknown) => {
      assert.ok(error instanceof ReviewFinalizerConflictError);
      assert.equal(error.message.includes(ADMISSION_ID), false);
      assert.equal(error.message.includes(REVIEW_ID), false);
      return true;
    });
  });

  it("returns indeterminate when an admitted ledger has no corresponding review", async () => {
    const finalizer = new InMemoryReviewFinalizer();
    finalizer.seedAdmittedAdmission(RESERVED);

    await assert.rejects(finalizer.finalize(input()), (error: unknown) => {
      assert.ok(error instanceof ReviewFinalizerIndeterminateError);
      assert.equal(error.message.includes(ADMISSION_ID), false);
      assert.equal(error.message.includes(REVIEW_ID), false);
      return true;
    });
  });

  it("rolls back the review when admitting the reservation fails", async () => {
    const failure = new ReviewFinalizerUnavailableError();
    const finalizer = new InMemoryReviewFinalizer({ failAfterReviewCreate: failure });
    finalizer.seedReservedAdmission(RESERVED);

    await assert.rejects(finalizer.finalize(input()), (error: unknown) => {
      assert.equal(error, failure);
      assert.equal(error.message.includes(REVIEW_ID), false);
      return true;
    });
    assert.equal(finalizer.findSummary(OWNER, REVIEW_ID), null);
    assert.equal(finalizer.findAdmission(OWNER, ADMISSION_ID)?.status, "RESERVED");
  });

  it("defines a redacted indeterminate error for ambiguous transaction outcomes", () => {
    const error = new ReviewFinalizerIndeterminateError();
    assert.equal(error.code, "REVIEW_FINALIZER_INDETERMINATE");
    assert.equal(error.message.includes(ADMISSION_ID), false);
    assert.equal(error.message.includes(REVIEW_ID), false);
  });
});
