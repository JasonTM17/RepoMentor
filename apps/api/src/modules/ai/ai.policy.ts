import { z } from "zod";

import {
  REVIEW_MAX_LANGUAGE_LENGTH,
  REVIEW_MAX_SOURCE_LENGTH,
  REVIEW_MODES,
  type ReviewMode,
} from "../review/review.types.js";
import { AiRequestError } from "./ai.errors.js";
import type { AiReasoningEffort, AiReviewRequest } from "./ai.types.js";

export const AI_MAX_SOURCE_LENGTH = REVIEW_MAX_SOURCE_LENGTH;
export const AI_MAX_LANGUAGE_LENGTH = REVIEW_MAX_LANGUAGE_LENGTH;
export const AI_MAX_FINDINGS = 50;
export const AI_MAX_SUMMARY_LENGTH = 4_000;
export const AI_MAX_FINDING_TITLE_LENGTH = 160;
export const AI_MAX_FINDING_DESCRIPTION_LENGTH = 2_000;
export const AI_MAX_FINDING_SUGGESTION_LENGTH = 2_000;
export const AI_MAX_FILE_PATH_LENGTH = 512;
export const AI_MAX_LINE_NUMBER = 1_000_000;
export const AI_MAX_IMPROVED_SOURCE_LENGTH = AI_MAX_SOURCE_LENGTH;
export const AI_MAX_DIFF_LENGTH = 64_000;
export const AI_MAX_GENERATED_TESTS = 3;
export const AI_MAX_GENERATED_TEST_LENGTH = 8_000;
export const AI_MAX_LEARNING_QUESTIONS = 5;
export const AI_MAX_LEARNING_QUESTION_LENGTH = 500;
export const AI_MAX_SYSTEM_PROMPT_LENGTH = 4_000;
export const AI_MAX_DEVELOPER_PROMPT_LENGTH = 8_000;
export const AI_MAX_USER_PROMPT_LENGTH = AI_MAX_SOURCE_LENGTH + 2_048;

export const AI_TIMEOUT_MS = 15_000;
export const AI_MAX_TIMEOUT_MS = 60_000;
export const AI_MAX_PROVIDER_RETRIES = 2;
export const AI_MAX_RESULT_RETRIES = 1;
export const AI_MAX_RESPONSE_BYTES = 1_048_576;
export const AI_MAX_OUTPUT_TOKENS = 8_192;
export const AI_RETRY_BACKOFF_MS = [100, 250] as const;

const aiReviewRequestSchema = z
  .object({
    source: z
      .string()
      .min(1)
      .max(AI_MAX_SOURCE_LENGTH)
      .refine((value) => /\S/u.test(value)),
    language: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(AI_MAX_LANGUAGE_LENGTH)
      .regex(/^[a-z0-9#+._-]+$/u),
    mode: z.enum(REVIEW_MODES),
  })
  .strict();

export function validateAiReviewRequest(input: unknown): AiReviewRequest {
  const result = aiReviewRequestSchema.safeParse(input);

  if (!result.success) {
    throw new AiRequestError();
  }

  return result.data;
}

export function mapReviewModeToReasoningEffort(mode: ReviewMode): AiReasoningEffort {
  switch (mode) {
    case "QUICK":
      return "low";
    case "STANDARD":
      return "medium";
    case "DEEP":
      return "max";
  }
}

export { aiReviewRequestSchema };
