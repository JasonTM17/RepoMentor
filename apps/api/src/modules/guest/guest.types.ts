import { AI_MODEL, AI_PROVIDER, type AiReasoningEffort, type AiUsage } from "../ai/ai.types.js";
import type { ReviewResult } from "../ai/review-result.schema.js";

export interface GuestReviewInput {
  readonly source: string;
  readonly language: string;
}

export interface GuestReviewExecutionResponse {
  readonly attempts: number;
  readonly durationMs: number;
  readonly model: typeof AI_MODEL;
  readonly provider: typeof AI_PROVIDER;
  readonly reasoningEffort: AiReasoningEffort;
  readonly usage: AiUsage | null;
}

export interface GuestReviewResponse {
  readonly execution: GuestReviewExecutionResponse;
  readonly result: ReviewResult;
}
