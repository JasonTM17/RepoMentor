import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AiProviderError, AiValidationError } from "../../src/modules/ai/ai.errors.js";
import { AiReviewService } from "../../src/modules/ai/ai-review.service.js";
import { FakeAiReviewProvider } from "../../src/modules/ai/fake-ai.provider.js";

const validResult = {
  schemaVersion: "v1",
  summary: "No actionable findings were detected.",
  findings: [],
} as const;

const reviewRequest = {
  source: "const answer = 42;",
  language: "typescript",
  mode: "DEEP" as const,
};

describe("AI review service", () => {
  it("returns validated Luna execution metadata and usage without network access", async () => {
    const provider = new FakeAiReviewProvider([
      {
        output: validResult,
        usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
      },
    ]);
    const execution = await new AiReviewService(provider).review(reviewRequest);

    assert.equal(execution.provider, "luna");
    assert.equal(execution.model, "gpt-5.6-luna");
    assert.equal(execution.reasoningEffort, "max");
    assert.deepEqual(execution.result, validResult);
    assert.deepEqual(execution.usage, { inputTokens: 12, outputTokens: 8, totalTokens: 20 });
    assert.equal(execution.attempts, 1);
    assert.ok(execution.durationMs >= 0);
    assert.equal(provider.requests.length, 1);
  });

  it("retries one invalid structured result with a static repair prompt", async () => {
    const provider = new FakeAiReviewProvider([
      { output: { schemaVersion: "v1", summary: "missing findings" } },
      { output: validResult },
    ]);
    const execution = await new AiReviewService(provider).review(reviewRequest);
    const secondRequest = provider.requests[1];

    assert.deepEqual(execution.result, validResult);
    assert.equal(execution.attempts, 2);
    assert.ok(secondRequest);
    assert.match(secondRequest.prompt.developer, /failed local schema validation/u);
    assert.equal(secondRequest.prompt.user.includes(reviewRequest.source), true);
  });

  it("fails closed with a typed validation error after the retry bound", async () => {
    const provider = new FakeAiReviewProvider([{ output: { unexpected: true } }]);

    await assert.rejects(new AiReviewService(provider).review(reviewRequest), (error: unknown) => {
      assert.ok(error instanceof AiValidationError);
      assert.equal(error.attempts, 2);
      return true;
    });
    assert.equal(provider.requests.length, 2);
  });

  it("normalizes an unexpected provider failure to a safe typed error", async () => {
    const provider = new FakeAiReviewProvider([new Error("source and secret must not escape")]);

    await assert.rejects(new AiReviewService(provider).review(reviewRequest), (error: unknown) => {
      assert.ok(error instanceof AiProviderError);
      assert.equal(error.code, "UNAVAILABLE");
      assert.equal(error.message.includes("source and secret"), false);
      return true;
    });
  });

  it("returns typed cancellation before invoking the provider", async () => {
    const provider = new FakeAiReviewProvider([{ output: validResult }]);
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      new AiReviewService(provider).review(reviewRequest, controller.signal),
      (error: unknown) => {
        assert.ok(error instanceof AiProviderError);
        assert.equal(error.code, "CANCELLED");
        return true;
      },
    );
    assert.equal(provider.requests.length, 0);
  });

  it("preserves cancellation after provider return without retry", async () => {
    const controller = new AbortController();
    const provider = new FakeAiReviewProvider([
      () => {
        controller.abort();
        return { output: validResult };
      },
    ]);

    await assert.rejects(
      new AiReviewService(provider).review(reviewRequest, controller.signal),
      (error: unknown) => {
        assert.ok(error instanceof AiProviderError);
        assert.equal(error.code, "CANCELLED");
        return true;
      },
    );
    assert.equal(provider.requests.length, 1);
  });
});
