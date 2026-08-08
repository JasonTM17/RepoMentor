import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AiValidationError } from "../../src/modules/ai/ai.errors.js";
import { AI_MAX_FINDINGS, AI_MAX_FINDING_TITLE_LENGTH } from "../../src/modules/ai/ai.policy.js";
import {
  parseReviewResult,
  reviewResultSchema,
} from "../../src/modules/ai/review-result.schema.js";

const validResult = {
  education: {
    diff: "@@ -1 +1 @@\n-const answer = 41;\n+const answer = 42;",
    generatedTests: ["test(\"answer\", () => assert.equal(answer, 42));"],
    improvedSource: "const answer = 42;",
    learningQuestions: ["Which invariant makes this value safe to change?"],
  },
  schemaVersion: "v1",
  summary: "One actionable issue was found.",
  findings: [
    {
      severity: "HIGH",
      category: "SECURITY",
      title: "Validate the input before use",
      description: "The value reaches a sensitive operation without validation.",
      suggestion: "Validate and constrain the value before passing it downstream.",
      filePath: "src/example.ts",
      startLine: 1,
      endLine: 2,
    },
  ],
} as const;

describe("structured AI review result", () => {
  it("accepts the exact bounded result contract and source line range", () => {
    assert.deepEqual(parseReviewResult(validResult, "first line\nsecond line"), validResult);
    assert.equal(reviewResultSchema.safeParse(validResult).success, true);
  });

  it("rejects unknown fields, reversed lines, and findings beyond source bounds", () => {
    assert.throws(() => parseReviewResult({ ...validResult, extra: true }), AiValidationError);
    assert.throws(
      () =>
        parseReviewResult({
          ...validResult,
          findings: [{ ...validResult.findings[0], startLine: 2, endLine: 1 }],
        }),
      AiValidationError,
    );
    assert.throws(() => parseReviewResult(validResult, "only one line"), AiValidationError);
  });

  it("normalizes legacy persisted results without education output", () => {
    const { education: _education, ...legacyResult } = validResult;

    assert.deepEqual(parseReviewResult(legacyResult), {
      ...legacyResult,
      education: {
        diff: null,
        generatedTests: [],
        improvedSource: null,
        learningQuestions: [],
      },
    });
  });

  it("enforces finding and text bounds before accepting model output", () => {
    assert.throws(
      () =>
        parseReviewResult({
          ...validResult,
          findings: Array.from({ length: AI_MAX_FINDINGS + 1 }, () => validResult.findings[0]),
        }),
      AiValidationError,
    );
    assert.throws(
      () =>
        parseReviewResult({
          ...validResult,
          findings: [
            {
              ...validResult.findings[0],
              title: "x".repeat(AI_MAX_FINDING_TITLE_LENGTH + 1),
            },
          ],
        }),
      AiValidationError,
    );
    assert.throws(
      () =>
        parseReviewResult({
          ...validResult,
          education: {
            ...validResult.education,
            generatedTests: ["x".repeat(8_001)],
          },
        }),
      AiValidationError,
    );
    assert.throws(
      () =>
        parseReviewResult({
          ...validResult,
          education: {
            ...validResult.education,
            learningQuestions: ["x".repeat(501)],
          },
        }),
      AiValidationError,
    );
  });
});
