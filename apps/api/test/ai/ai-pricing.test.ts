import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AI_PRICING_MAX_RATE,
  InvalidAiPricingConfigError,
  estimateAiUsageCostMicros,
  parseAiPricingConfig,
} from "../../src/modules/ai/ai-pricing.js";

const validEnvironment = {
  AI_PRICING_VERSION: "v1",
  AI_INPUT_USD_MICROS_PER_MILLION_TOKENS: "3000000",
  AI_CACHED_INPUT_USD_MICROS_PER_MILLION_TOKENS: "1000000",
  AI_OUTPUT_USD_MICROS_PER_MILLION_TOKENS: "6000000",
};

describe("AI pricing", () => {
  it("disables pricing when no pricing variables are configured", () => {
    assert.equal(parseAiPricingConfig({}), undefined);
  });

  it("parses a complete versioned configuration", () => {
    assert.deepEqual(parseAiPricingConfig(validEnvironment), {
      version: "v1",
      inputUsdMicrosPerMillionTokens: 3_000_000,
      cachedInputUsdMicrosPerMillionTokens: 1_000_000,
      outputUsdMicrosPerMillionTokens: 6_000_000,
    });
  });

  it("rejects partial and invalid configuration without exposing values", () => {
    assert.throws(
      () =>
        parseAiPricingConfig({
          AI_PRICING_VERSION: "v1",
          AI_INPUT_USD_MICROS_PER_MILLION_TOKENS: "not-a-rate-secret",
        }),
      (error: unknown) => {
        assert.ok(error instanceof InvalidAiPricingConfigError);
        assert.deepEqual(error.variableNames, [
          "AI_CACHED_INPUT_USD_MICROS_PER_MILLION_TOKENS",
          "AI_INPUT_USD_MICROS_PER_MILLION_TOKENS",
          "AI_OUTPUT_USD_MICROS_PER_MILLION_TOKENS",
        ]);
        assert.doesNotMatch(error.message, /not-a-rate-secret/u);
        return true;
      },
    );

    assert.throws(
      () =>
        parseAiPricingConfig({
          AI_PRICING_VERSION: "v1\nsecret",
          AI_INPUT_USD_MICROS_PER_MILLION_TOKENS: "0",
          AI_CACHED_INPUT_USD_MICROS_PER_MILLION_TOKENS: "0",
          AI_OUTPUT_USD_MICROS_PER_MILLION_TOKENS: "1000000001",
        }),
      InvalidAiPricingConfigError,
    );
  });

  it("uses cached tokens separately and floors micro-dollar math", () => {
    const config = parseAiPricingConfig({
      AI_PRICING_VERSION: "v1",
      AI_INPUT_USD_MICROS_PER_MILLION_TOKENS: "3",
      AI_CACHED_INPUT_USD_MICROS_PER_MILLION_TOKENS: "2",
      AI_OUTPUT_USD_MICROS_PER_MILLION_TOKENS: "5",
    });

    assert.ok(config);
    assert.equal(
      estimateAiUsageCostMicros(
        { inputTokens: 1_000_001, cachedInputTokens: 250_000, outputTokens: 2 },
        config,
      ),
      2,
    );
    assert.equal(
      estimateAiUsageCostMicros(
        { inputTokens: 100, cachedInputTokens: 500, outputTokens: 0 },
        config,
      ),
      0,
    );
  });

  it("returns zero when all configured rates are zero", () => {
    const config = parseAiPricingConfig({
      AI_PRICING_VERSION: "v1",
      AI_INPUT_USD_MICROS_PER_MILLION_TOKENS: "0",
      AI_CACHED_INPUT_USD_MICROS_PER_MILLION_TOKENS: "0",
      AI_OUTPUT_USD_MICROS_PER_MILLION_TOKENS: "0",
    });

    assert.ok(config);
    assert.equal(
      estimateAiUsageCostMicros(
        { inputTokens: Number.MAX_SAFE_INTEGER, cachedInputTokens: 0, outputTokens: 1 },
        config,
      ),
      0,
    );
  });

  it("accepts the maximum bounded rate and rejects an unsafe output", () => {
    const config = parseAiPricingConfig({
      AI_PRICING_VERSION: "v".repeat(80),
      AI_INPUT_USD_MICROS_PER_MILLION_TOKENS: String(AI_PRICING_MAX_RATE),
      AI_CACHED_INPUT_USD_MICROS_PER_MILLION_TOKENS: "0",
      AI_OUTPUT_USD_MICROS_PER_MILLION_TOKENS: "0",
    });

    assert.ok(config);
    assert.equal(
      estimateAiUsageCostMicros(
        { inputTokens: 9_007_199, cachedInputTokens: 0, outputTokens: 0 },
        config,
      ),
      9_007_199_000,
    );
    assert.throws(
      () =>
        estimateAiUsageCostMicros(
          { inputTokens: Number.MAX_SAFE_INTEGER, cachedInputTokens: 0, outputTokens: 0 },
          config,
        ),
      RangeError,
    );
  });
});
