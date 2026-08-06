import type { ReviewMode } from "../review/review.types.js";

export const AI_REVIEW_PROVIDER = Symbol("AI_REVIEW_PROVIDER");

export const AI_PROVIDER = "luna" as const;
export const AI_MODEL = "gpt-5.6-luna" as const;
export const AI_PROMPT_VERSION = "v1" as const;

export const AI_REASONING_EFFORTS = ["low", "medium", "max"] as const;
export type AiReasoningEffort = (typeof AI_REASONING_EFFORTS)[number];

export interface AiReviewRequest {
  readonly source: string;
  readonly language: string;
  readonly mode: ReviewMode;
}

export interface AiReviewPrompt {
  readonly version: typeof AI_PROMPT_VERSION;
  readonly system: string;
  readonly developer: string;
  readonly user: string;
  readonly schema: Readonly<Record<string, unknown>>;
}

export interface AiProviderRequest {
  readonly provider: typeof AI_PROVIDER;
  readonly model: typeof AI_MODEL;
  readonly reasoningEffort: AiReasoningEffort;
  readonly prompt: AiReviewPrompt;
  readonly attempt: number;
  readonly signal?: AbortSignal;
}

export interface AiUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly cachedInputTokens?: number;
}

export interface AiProviderResult {
  readonly output: unknown;
  readonly usage?: AiUsage;
}

export interface AiReviewProvider {
  review(request: AiProviderRequest): Promise<AiProviderResult>;
}

export interface AiReviewExecution<ReviewResult = unknown> {
  readonly provider: typeof AI_PROVIDER;
  readonly model: typeof AI_MODEL;
  readonly reasoningEffort: AiReasoningEffort;
  readonly result: ReviewResult;
  readonly durationMs: number;
  readonly attempts: number;
  readonly usage?: AiUsage;
}
