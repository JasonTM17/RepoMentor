import type { AiUsage } from "./ai.types.js";

export const AI_PRICING_CONFIG = Symbol("AI_PRICING_CONFIG");

export const AI_PRICING_ENV_NAMES = {
  VERSION: "AI_PRICING_VERSION",
  INPUT_RATE: "AI_INPUT_USD_MICROS_PER_MILLION_TOKENS",
  CACHED_INPUT_RATE: "AI_CACHED_INPUT_USD_MICROS_PER_MILLION_TOKENS",
  OUTPUT_RATE: "AI_OUTPUT_USD_MICROS_PER_MILLION_TOKENS",
} as const;

export const AI_PRICING_MAX_VERSION_LENGTH = 80;
export const AI_PRICING_MAX_RATE = 1_000_000_000;
const AI_PRICING_RATE_DIVISOR = 1_000_000n;
const AI_PRICING_MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

const AI_PRICING_ENV_KEYS = [
  AI_PRICING_ENV_NAMES.VERSION,
  AI_PRICING_ENV_NAMES.INPUT_RATE,
  AI_PRICING_ENV_NAMES.CACHED_INPUT_RATE,
  AI_PRICING_ENV_NAMES.OUTPUT_RATE,
] as const;

type AiPricingEnvironmentName = (typeof AI_PRICING_ENV_KEYS)[number];

export interface AiPricingConfig {
  readonly version: string;
  readonly inputUsdMicrosPerMillionTokens: number;
  readonly cachedInputUsdMicrosPerMillionTokens: number;
  readonly outputUsdMicrosPerMillionTokens: number;
}

export type AiPricingUsage = Pick<AiUsage, "inputTokens" | "outputTokens" | "cachedInputTokens">;

export class InvalidAiPricingConfigError extends Error {
  readonly variableNames: readonly string[];

  constructor(variableNames: Iterable<string>) {
    const names = [...new Set(variableNames)].sort();

    super(`Invalid AI pricing configuration: ${names.join(", ")}`);
    this.name = "InvalidAiPricingConfigError";
    this.variableNames = names;
  }
}

function parseVersion(
  variableName: AiPricingEnvironmentName,
  rawValue: string | undefined,
  invalidVariables: Set<string>,
): string | undefined {
  if (
    typeof rawValue !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(rawValue) ||
    rawValue.length > AI_PRICING_MAX_VERSION_LENGTH
  ) {
    invalidVariables.add(variableName);
    return undefined;
  }

  return rawValue;
}

function parseRate(
  variableName: AiPricingEnvironmentName,
  rawValue: string | undefined,
  invalidVariables: Set<string>,
): number | undefined {
  if (typeof rawValue !== "string") {
    invalidVariables.add(variableName);
    return undefined;
  }

  const normalizedValue = rawValue.trim();

  if (!/^\d+$/u.test(normalizedValue)) {
    invalidVariables.add(variableName);
    return undefined;
  }

  const value = Number(normalizedValue);

  if (!Number.isSafeInteger(value) || value < 0 || value > AI_PRICING_MAX_RATE) {
    invalidVariables.add(variableName);
    return undefined;
  }

  return value;
}

export function parseAiPricingConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AiPricingConfig | undefined {
  if (AI_PRICING_ENV_KEYS.every((variableName) => environment[variableName] === undefined)) {
    return undefined;
  }

  const invalidVariables = new Set<string>(
    AI_PRICING_ENV_KEYS.filter((variableName) => environment[variableName] === undefined),
  );
  const version = parseVersion(
    AI_PRICING_ENV_NAMES.VERSION,
    environment.AI_PRICING_VERSION,
    invalidVariables,
  );
  const inputRate = parseRate(
    AI_PRICING_ENV_NAMES.INPUT_RATE,
    environment.AI_INPUT_USD_MICROS_PER_MILLION_TOKENS,
    invalidVariables,
  );
  const cachedInputRate = parseRate(
    AI_PRICING_ENV_NAMES.CACHED_INPUT_RATE,
    environment.AI_CACHED_INPUT_USD_MICROS_PER_MILLION_TOKENS,
    invalidVariables,
  );
  const outputRate = parseRate(
    AI_PRICING_ENV_NAMES.OUTPUT_RATE,
    environment.AI_OUTPUT_USD_MICROS_PER_MILLION_TOKENS,
    invalidVariables,
  );

  if (
    invalidVariables.size > 0 ||
    version === undefined ||
    inputRate === undefined ||
    cachedInputRate === undefined ||
    outputRate === undefined
  ) {
    throw new InvalidAiPricingConfigError(invalidVariables);
  }

  return {
    version,
    inputUsdMicrosPerMillionTokens: inputRate,
    cachedInputUsdMicrosPerMillionTokens: cachedInputRate,
    outputUsdMicrosPerMillionTokens: outputRate,
  };
}

function toNonNegativeBigInt(value: number): bigint {
  const bigintValue = BigInt(value);

  return bigintValue < 0n ? 0n : bigintValue;
}

export function estimateAiUsageCostMicros(usage: AiPricingUsage, config: AiPricingConfig): number {
  const inputTokens = toNonNegativeBigInt(usage.inputTokens);
  const cachedInputTokens = toNonNegativeBigInt(usage.cachedInputTokens ?? 0);
  const outputTokens = toNonNegativeBigInt(usage.outputTokens);
  const uncachedInputTokens =
    inputTokens > cachedInputTokens ? inputTokens - cachedInputTokens : 0n;
  const numerator =
    uncachedInputTokens * BigInt(config.inputUsdMicrosPerMillionTokens) +
    cachedInputTokens * BigInt(config.cachedInputUsdMicrosPerMillionTokens) +
    outputTokens * BigInt(config.outputUsdMicrosPerMillionTokens);
  const estimatedCostMicros = numerator / AI_PRICING_RATE_DIVISOR;

  if (estimatedCostMicros > AI_PRICING_MAX_SAFE_INTEGER) {
    throw new RangeError("AI pricing estimate exceeds the safe integer range");
  }

  return Number(estimatedCostMicros);
}
