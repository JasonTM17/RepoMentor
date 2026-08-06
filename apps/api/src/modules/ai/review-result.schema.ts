import { z } from "zod";

import {
  AI_MAX_FILE_PATH_LENGTH,
  AI_MAX_FINDING_DESCRIPTION_LENGTH,
  AI_MAX_FINDING_SUGGESTION_LENGTH,
  AI_MAX_FINDING_TITLE_LENGTH,
  AI_MAX_FINDINGS,
  AI_MAX_LINE_NUMBER,
  AI_MAX_SUMMARY_LENGTH,
} from "./ai.policy.js";
import { AiValidationError } from "./ai.errors.js";
import { AI_PROMPT_VERSION } from "./ai.types.js";

export const REVIEW_RESULT_SCHEMA_NAME = "repomentor_code_review";

const nonBlankText = (maxLength: number) => z.string().trim().min(1).max(maxLength);

const reviewFindingSchema = z
  .object({
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    category: z.enum(["BUG", "SECURITY", "PERFORMANCE", "MAINTAINABILITY", "STYLE"]),
    title: nonBlankText(AI_MAX_FINDING_TITLE_LENGTH),
    description: nonBlankText(AI_MAX_FINDING_DESCRIPTION_LENGTH),
    suggestion: nonBlankText(AI_MAX_FINDING_SUGGESTION_LENGTH),
    filePath: nonBlankText(AI_MAX_FILE_PATH_LENGTH),
    startLine: z.number().int().min(1).max(AI_MAX_LINE_NUMBER),
    endLine: z.number().int().min(1).max(AI_MAX_LINE_NUMBER),
  })
  .strict()
  .superRefine((finding, context) => {
    if (finding.endLine < finding.startLine) {
      context.addIssue({
        code: "custom",
        message: "endLine must not precede startLine",
        path: ["endLine"],
      });
    }
  });

export const reviewResultSchema = z
  .object({
    schemaVersion: z.literal(AI_PROMPT_VERSION),
    summary: nonBlankText(AI_MAX_SUMMARY_LENGTH),
    findings: z.array(reviewFindingSchema).max(AI_MAX_FINDINGS),
  })
  .strict();

export type ReviewFinding = z.infer<typeof reviewFindingSchema>;
export type ReviewResult = z.infer<typeof reviewResultSchema>;

export const reviewResultJsonSchema: Readonly<Record<string, unknown>> = {
  type: "object",
  properties: {
    schemaVersion: {
      type: "string",
      enum: [AI_PROMPT_VERSION],
    },
    summary: {
      type: "string",
      minLength: 1,
      maxLength: AI_MAX_SUMMARY_LENGTH,
    },
    findings: {
      type: "array",
      maxItems: AI_MAX_FINDINGS,
      items: {
        type: "object",
        properties: {
          severity: {
            type: "string",
            enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
          },
          category: {
            type: "string",
            enum: ["BUG", "SECURITY", "PERFORMANCE", "MAINTAINABILITY", "STYLE"],
          },
          title: {
            type: "string",
            minLength: 1,
            maxLength: AI_MAX_FINDING_TITLE_LENGTH,
          },
          description: {
            type: "string",
            minLength: 1,
            maxLength: AI_MAX_FINDING_DESCRIPTION_LENGTH,
          },
          suggestion: {
            type: "string",
            minLength: 1,
            maxLength: AI_MAX_FINDING_SUGGESTION_LENGTH,
          },
          filePath: {
            type: "string",
            minLength: 1,
            maxLength: AI_MAX_FILE_PATH_LENGTH,
          },
          startLine: {
            type: "integer",
            minimum: 1,
            maximum: AI_MAX_LINE_NUMBER,
          },
          endLine: {
            type: "integer",
            minimum: 1,
            maximum: AI_MAX_LINE_NUMBER,
          },
        },
        required: [
          "severity",
          "category",
          "title",
          "description",
          "suggestion",
          "filePath",
          "startLine",
          "endLine",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["schemaVersion", "summary", "findings"],
  additionalProperties: false,
};

function sourceLineCount(source: string): number {
  return source.split(/\r?\n/u).length;
}

export function parseReviewResult(value: unknown, source?: string): ReviewResult {
  const result = reviewResultSchema.safeParse(value);

  if (!result.success) {
    throw new AiValidationError();
  }

  if (source !== undefined) {
    const lineCount = sourceLineCount(source);

    if (result.data.findings.some((finding) => finding.endLine > lineCount)) {
      throw new AiValidationError();
    }
  }

  return result.data;
}

export { reviewFindingSchema };
