import { z } from "zod";

import { AI_MAX_RESULT_RETRIES } from "../ai/ai.policy.js";
import {
  AI_MODEL,
  AI_PROVIDER,
  AI_REASONING_EFFORTS,
  type AiReviewExecution,
  type AiUsage,
} from "../ai/ai.types.js";
import { reviewResultSchema, type ReviewResult } from "../ai/review-result.schema.js";

export const REVIEW_RESULT_MAX_JSON_BYTES = 1_048_576;
export const REVIEW_EXECUTION_MAX_DURATION_MS = 600_000;
export const REVIEW_EXECUTION_MAX_ATTEMPTS = AI_MAX_RESULT_RETRIES + 1;
export const REVIEW_USAGE_MAX_TOKENS = 10_000_000;

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
  readonly usage: AiUsage | null;
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

function toUsageRecord(usage: PersistedAiReviewExecution["usage"]): AiUsage | null {
  if (usage === undefined) {
    return null;
  }

  return {
    ...(usage.cachedInputTokens === undefined
      ? {}
      : { cachedInputTokens: usage.cachedInputTokens }),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
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
    usage: toUsageRecord(persisted.usage),
  };
}

export function parsePersistedReviewResult(value: unknown): ReviewResult {
  const parsed = reviewResultSchema.safeParse(value);

  if (!parsed.success || resultJsonBytes(parsed.data) > REVIEW_RESULT_MAX_JSON_BYTES) {
    throw new ReviewPersistenceBoundaryError();
  }

  return parsed.data;
}
