import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AiProviderError } from "../../src/modules/ai/ai.errors.js";
import { VersionedCodeReviewPromptBuilder } from "../../src/modules/ai/review-prompt.builder.js";
import { LunaOpenAiProvider } from "../../src/modules/ai/luna-openai.provider.js";
import { AI_MODEL, AI_PROVIDER, type AiProviderRequest } from "../../src/modules/ai/ai.types.js";

const source = "const answer = 42;";
const output = {
  education: {
    diff: null,
    generatedTests: [],
    improvedSource: null,
    learningQuestions: [],
  },
  schemaVersion: "v1",
  summary: "No actionable findings were detected.",
  findings: [],
};

function providerRequest(): AiProviderRequest {
  const prompt = new VersionedCodeReviewPromptBuilder().build({
    source,
    language: "typescript",
    mode: "DEEP",
  });

  return {
    provider: AI_PROVIDER,
    model: AI_MODEL,
    reasoningEffort: "max",
    prompt,
    attempt: 0,
  };
}

function providerRequestWithSignal(signal: AbortSignal): AiProviderRequest {
  return { ...providerRequest(), signal };
}

describe("native Luna Responses provider", () => {
  it("uses a hard-pinned model, strict schema, and injected fetch only", async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    const fetcher: typeof globalThis.fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify(output) }],
            },
          ],
          usage: {
            input_tokens: 14,
            output_tokens: 9,
            total_tokens: 23,
            input_tokens_details: { cached_tokens: 2 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const result = await new LunaOpenAiProvider({
      apiKey: "unit-test-token",
      baseUrl: "https://api.openai.com/v1/",
      fetch: fetcher,
      sleep: async () => undefined,
    }).review(providerRequest());
    const body = JSON.parse(String(capturedInit?.body)) as {
      model: string;
      reasoning: { effort: string };
      input: Array<{ role: string; content: string }>;
      text: { format: { type: string; name: string; strict: boolean; schema: unknown } };
      store: boolean;
    };

    assert.equal(capturedUrl, "https://api.openai.com/v1/responses");
    assert.equal(capturedInit?.method, "POST");
    assert.equal(capturedInit?.redirect, "error");
    assert.equal(new Headers(capturedInit?.headers).get("authorization"), "Bearer unit-test-token");
    assert.equal(body.model, "gpt-5.6-luna");
    assert.equal(body.reasoning.effort, "max");
    assert.deepEqual(
      body.input.map((item) => item.role),
      ["system", "developer", "user"],
    );
    assert.equal(body.input[2]?.content.includes(source), true);
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.name, "repomentor_code_review");
    assert.equal(body.text.format.strict, true);
    assert.equal(body.store, false);
    assert.deepEqual(result.output, output);
    assert.deepEqual(result.usage, {
      inputTokens: 14,
      outputTokens: 9,
      totalTokens: 23,
      cachedInputTokens: 2,
    });
  });

  it("does not call fetch when the server-side Luna secret is absent", async () => {
    let fetchCalls = 0;
    const fetcher: typeof globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("network must not be called");
    };

    await assert.rejects(
      new LunaOpenAiProvider({
        apiKey: "",
        fetch: fetcher,
      }).review(providerRequest()),
      (error: unknown) => {
        assert.ok(error instanceof AiProviderError);
        assert.equal(error.code, "CONFIGURATION");
        return true;
      },
    );
    assert.equal(fetchCalls, 0);
  });

  it("retries only bounded transient failures and returns a typed safe error", async () => {
    let fetchCalls = 0;
    const fetcher: typeof globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("provider body contains source and secret", { status: 503 });
    };

    await assert.rejects(
      new LunaOpenAiProvider({
        apiKey: "unit-test-token",
        fetch: fetcher,
        maxRetries: 2,
        sleep: async () => undefined,
      }).review(providerRequest()),
      (error: unknown) => {
        assert.ok(error instanceof AiProviderError);
        assert.equal(error.code, "UNAVAILABLE");
        assert.equal(error.attempts, 3);
        assert.equal(error.message.includes("provider body"), false);
        assert.equal(error.message.includes("source and secret"), false);
        return true;
      },
    );
    assert.equal(fetchCalls, 3);
  });

  it("rejects any runtime provider/model override before fetch", async () => {
    let fetchCalls = 0;
    const fetcher: typeof globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("network must not be called");
    };
    const request = { ...providerRequest(), model: "other-model" } as unknown as AiProviderRequest;

    await assert.rejects(
      new LunaOpenAiProvider({ apiKey: "unit-test-token", fetch: fetcher }).review(request),
      (error: unknown) => {
        assert.ok(error instanceof AiProviderError);
        assert.equal(error.code, "INVALID_REQUEST");
        return true;
      },
    );
    assert.equal(fetchCalls, 0);
  });

  it("rejects every endpoint outside the fixed deployment-owned origin before fetch", () => {
    for (const baseUrl of [
      "https://evil.example/v1",
      "https://10.0.0.1/v1",
      "https://127.0.0.1/v1",
      "https://localhost/v1",
      "http://api.openai.com/v1",
      "https://user:pass@api.openai.com/v1",
      "https://api.openai.com/v1?next=http://evil.example",
      "https://api.openai.com/v1#fragment",
    ]) {
      let fetchCalls = 0;
      const fetcher: typeof globalThis.fetch = async () => {
        fetchCalls += 1;
        throw new Error("network must not be called");
      };

      assert.throws(
        () => new LunaOpenAiProvider({ apiKey: "unit-test-token", baseUrl, fetch: fetcher }),
        (error: unknown) => {
          assert.ok(error instanceof AiProviderError);
          assert.equal(error.code, "CONFIGURATION");
          return true;
        },
      );
      assert.equal(fetchCalls, 0);
    }
  });

  it("maps caller cancellation to a typed error without retrying", async () => {
    let fetchCalls = 0;
    const controller = new AbortController();
    const fetcher: typeof globalThis.fetch = async (_input, init) => {
      fetchCalls += 1;
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
      throw new Error("unreachable");
    };
    const pending = new LunaOpenAiProvider({
      apiKey: "unit-test-token",
      fetch: fetcher,
      sleep: async () => undefined,
    }).review(providerRequestWithSignal(controller.signal));

    controller.abort();

    await assert.rejects(pending, (error: unknown) => {
      assert.ok(error instanceof AiProviderError);
      assert.equal(error.code, "CANCELLED");
      assert.equal(error.attempts, 1);
      return true;
    });
    assert.equal(fetchCalls, 1);
  });

  it("covers an in-flight fetch with the bounded timeout", async () => {
    const fetcher: typeof globalThis.fetch = async (_input, init) => {
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("timed out")), {
          once: true,
        });
      });
      throw new Error("unreachable");
    };

    await assert.rejects(
      new LunaOpenAiProvider({
        apiKey: "unit-test-token",
        fetch: fetcher,
        maxRetries: 0,
        timeoutMs: 1,
      }).review(providerRequest()),
      (error: unknown) => {
        assert.ok(error instanceof AiProviderError);
        assert.equal(error.code, "TIMEOUT");
        assert.equal(error.attempts, 1);
        return true;
      },
    );
  });
});
