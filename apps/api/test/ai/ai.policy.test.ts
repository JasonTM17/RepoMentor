import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AiRequestError } from "../../src/modules/ai/ai.errors.js";
import {
  AI_MAX_SOURCE_LENGTH,
  mapReviewModeToReasoningEffort,
  validateAiReviewRequest,
} from "../../src/modules/ai/ai.policy.js";

describe("AI review policy", () => {
  it("maps every public review mode to the only supported reasoning efforts", () => {
    assert.equal(mapReviewModeToReasoningEffort("QUICK"), "low");
    assert.equal(mapReviewModeToReasoningEffort("STANDARD"), "medium");
    assert.equal(mapReviewModeToReasoningEffort("DEEP"), "max");
  });

  it("normalizes bounded request metadata without accepting provider selection", () => {
    assert.deepEqual(
      validateAiReviewRequest({
        source: "const answer = 42;",
        language: " TypeScript ",
        learnerLevel: "INTERMEDIATE",
        mode: "STANDARD",
      }),
      {
        source: "const answer = 42;",
        language: "typescript",
        learnerLevel: "INTERMEDIATE",
        mode: "STANDARD",
      },
    );

    assert.throws(
      () =>
        validateAiReviewRequest({
          source: "const answer = 42;",
          language: "typescript",
          mode: "STANDARD",
          provider: "other",
        }),
      AiRequestError,
    );
  });

  it("rejects empty, oversized, and invalid-language requests", () => {
    for (const input of [
      { source: "", language: "typescript", learnerLevel: "INTERMEDIATE", mode: "STANDARD" },
      {
        source: "x".repeat(AI_MAX_SOURCE_LENGTH + 1),
        language: "typescript",
        learnerLevel: "INTERMEDIATE",
        mode: "STANDARD",
      },
      {
        source: "const answer = 42;",
        language: "Type Script",
        learnerLevel: "INTERMEDIATE",
        mode: "STANDARD",
      },
    ]) {
      assert.throws(() => validateAiReviewRequest(input), AiRequestError);
    }
  });
});
