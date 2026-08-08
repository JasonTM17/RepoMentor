import { z } from "zod";

import { AI_MAX_RESULT_RETRIES } from "../ai/ai.policy.js";
import { estimateAiUsageCostMicros, type AiPricingConfig } from "../ai/ai-pricing.js";
import {
  AI_MODEL,
  AI_PROVIDER,
  AI_REASONING_EFFORTS,
  type AiReviewExecution,
  type PersistedAiUsage,
} from "../ai/ai.types.js";
import { reviewResultSchema, type ReviewResult } from "../ai/review-result.schema.js";

export const REVIEW_RESULT_MAX_JSON_BYTES = 1_048_576;
export const REVIEW_EXECUTION_MAX_DURATION_MS = 600_000;
export const REVIEW_EXECUTION_MAX_ATTEMPTS = AI_MAX_RESULT_RETRIES + 1;
export const REVIEW_USAGE_MAX_TOKENS = 10_000_000;
const REVIEW_USAGE_MAX_COST_MICROS = Number.MAX_SAFE_INTEGER;
const PRICING_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;

const aiUsageSchema = z
  .object({
    cachedInputTokens: z.number().int().min(0).max(REVIEW_USAGE_MAX_TOKENS).optional(),
    inputTokens: z.number().int().min(0).max(REVIEW_USAGE_MAX_TOKENS),
    outputTokens: z.number().int().min(0).max(REVIEW_USAGE_MAX_TOKENS),
    totalTokens: z.number().int().min(0).max(REVIEW_USAGE_MAX_TOKENS),
  })
  .strict()
  .superRefine((usage, context) => {
    if (usage.totalTokens !== usage.inputTokens + usage.outputTokens) {
      context.addIssue({
        code: "custom",
        message: "totalTokens must equal inputTokens plus outputTokens",
        path: ["totalTokens"],
      });
    }

    if (usage.cachedInputTokens !== undefined && usage.cachedInputTokens > usage.inputTokens) {
      context.addIssue({
        code: "custom",
        message: "cachedInputTokens must not exceed inputTokens",
        path: ["cachedInputTokens"],
      });
    }
  });

export const persistedAiReviewExecutionSchema = z
  .object({
    attempts: z.number().int().min(1).max(REVIEW_EXECUTION_MAX_ATTEMPTS),
    durationMs: z.number().int().min(0).max(REVIEW_EXECUTION_MAX_DURATION_MS),
    model: z.literal(AI_MODEL),
    provider: z.literal(AI_PROVIDER),
    reasoningEffort: z.enum(AI_REASONING_EFFORTS),
    result: reviewResultSchema,
    usage: aiUsageSchema.optional(),
  })
  .strict();

export type PersistedAiReviewExecution = z.infer<typeof persistedAiReviewExecutionSchema>;

export interface ReviewResultRecord {
  readonly reviewId: string;
  readonly provider: typeof AI_PROVIDER;
  readonly model: typeof AI_MODEL;
  readonly reasoningEffort: PersistedAiReviewExecution["reasoningEffort"];
  readonly result: ReviewResult;
  readonly durationMs: number;
  readonly attempts: number;
  readonly usage: PersistedAiUsage | null;
  readonly createdAt: Date;
}

export class ReviewPersistenceBoundaryError extends Error {
  readonly code = "INVALID_EXECUTION" as const;

  constructor() {
    super("The validated AI review execution could not be persisted.");
    this.name = "ReviewPersistenceBoundaryError";
  }
}

function resultJsonBytes(result: ReviewResult): number {
  return new TextEncoder().encode(JSON.stringify(result)).byteLength;
}

export function toPersistedAiUsageRecord(
  usage: PersistedAiReviewExecution["usage"],
  pricingConfig?: AiPricingConfig,
): PersistedAiUsage | null {
  if (usage === undefined) {
    return null;
  }

  const pricingUsage =
    usage.cachedInputTokens === undefined
      ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
      : {
          cachedInputTokens: usage.cachedInputTokens,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        };
  const persisted: Omit<PersistedAiUsage, "cachedInputTokens"> = {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    estimatedCostMicros:
      pricingConfig === undefined ? null : estimateAiUsageCostMicros(pricingUsage, pricingConfig),
    pricingVersion: pricingConfig?.version ?? null,
  };

  return usage.cachedInputTokens === undefined
    ? persisted
    : { ...persisted, cachedInputTokens: usage.cachedInputTokens };
}

function toSafeCostMicros(value: bigint | number | null): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value === "bigint") {
    if (value < 0n || value > BigInt(REVIEW_USAGE_MAX_COST_MICROS)) {
      throw new ReviewPersistenceBoundaryError();
    }

    return Number(value);
  }

  if (!Number.isSafeInteger(value) || value < 0 || value > REVIEW_USAGE_MAX_COST_MICROS) {
    throw new ReviewPersistenceBoundaryError();
  }

  return value;
}

export function toPersistedAiUsageRecordFromStorage(input: {
  readonly cachedInputTokens: number | null;
  readonly estimatedCostMicros: bigint | number | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly pricingVersion: string | null;
  readonly totalTokens: number;
}): PersistedAiUsage {
  const parsed = aiUsageSchema.safeParse({
    ...(input.cachedInputTokens === null ? {} : { cachedInputTokens: input.cachedInputTokens }),
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalTokens: input.totalTokens,
  });
  const estimatedCostMicros = toSafeCostMicros(input.estimatedCostMicros);

  if (
    !parsed.success ||
    (estimatedCostMicros === null) !== (input.pricingVersion === null) ||
    (input.pricingVersion !== null && !PRICING_VERSION_PATTERN.test(input.pricingVersion))
  ) {
    throw new ReviewPersistenceBoundaryError();
  }

  const persisted: Omit<PersistedAiUsage, "cachedInputTokens"> = {
    estimatedCostMicros,
    inputTokens: parsed.data.inputTokens,
    outputTokens: parsed.data.outputTokens,
    pricingVersion: input.pricingVersion,
    totalTokens: parsed.data.totalTokens,
  };

  return parsed.data.cachedInputTokens === undefined
    ? persisted
    : { ...persisted, cachedInputTokens: parsed.data.cachedInputTokens };
}

export function validatePersistedAiReviewExecution(execution: unknown): PersistedAiReviewExecution {
  const parsed = persistedAiReviewExecutionSchema.safeParse(execution);

  if (!parsed.success || resultJsonBytes(parsed.data.result) > REVIEW_RESULT_MAX_JSON_BYTES) {
    throw new ReviewPersistenceBoundaryError();
  }

  return parsed.data;
}

export function toReviewResultRecord(
  reviewId: string,
  execution: AiReviewExecution<ReviewResult>,
  createdAt: Date,
  pricingConfig?: AiPricingConfig,
): ReviewResultRecord {
  const persisted = validatePersistedAiReviewExecution(execution);

  return {
    attempts: persisted.attempts,
    createdAt: new Date(createdAt),
    durationMs: persisted.durationMs,
    model: persisted.model,
    provider: persisted.provider,
    reasoningEffort: persisted.reasoningEffort,
    result: persisted.result,
    reviewId,
    usage: toPersistedAiUsageRecord(persisted.usage, pricingConfig),
  };
}

export function parsePersistedReviewResult(value: unknown): ReviewResult {
  const parsed = reviewResultSchema.safeParse(value);

  if (!parsed.success || resultJsonBytes(parsed.data) > REVIEW_RESULT_MAX_JSON_BYTES) {
    throw new ReviewPersistenceBoundaryError();
  }

  return parsed.data;
}
