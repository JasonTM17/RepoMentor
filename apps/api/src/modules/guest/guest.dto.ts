import { Transform } from "class-transformer";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

import { AI_MODEL, AI_PROVIDER, type AiReasoningEffort, type AiUsage } from "../ai/ai.types.js";
import type { ReviewResult } from "../ai/review-result.schema.js";
import { REVIEW_MAX_LANGUAGE_LENGTH, REVIEW_MAX_SOURCE_LENGTH } from "../review/review.types.js";

const trimLowercase = ({ value }: { readonly value: unknown }): unknown =>
  typeof value === "string" ? value.trim().toLowerCase() : value;

export const guestReviewRequestSchema = {
  additionalProperties: false,
  properties: {
    language: {
      maxLength: REVIEW_MAX_LANGUAGE_LENGTH,
      minLength: 1,
      pattern: "^[a-z0-9#+._-]+$",
      type: "string",
    },
    source: {
      maxLength: REVIEW_MAX_SOURCE_LENGTH,
      minLength: 1,
      type: "string",
    },
  },
  required: ["source", "language"],
  type: "object",
};

export class GuestReviewDto {
  @ApiProperty({
    description: "Source text to review. The source is processed transiently and is not persisted.",
    example: "const answer = 42;",
    maxLength: REVIEW_MAX_SOURCE_LENGTH,
    minLength: 1,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(REVIEW_MAX_SOURCE_LENGTH)
  @Matches(/\S/u)
  source!: string;

  @ApiProperty({
    description: "Lowercase source language identifier.",
    example: "typescript",
    maxLength: REVIEW_MAX_LANGUAGE_LENGTH,
    minLength: 1,
  })
  @Transform(trimLowercase)
  @IsString()
  @MinLength(1)
  @MaxLength(REVIEW_MAX_LANGUAGE_LENGTH)
  @Matches(/^[a-z0-9#+._-]+$/u)
  language!: string;
}

export class GuestReviewExecutionResponseDto {
  @ApiProperty({ example: 1, maximum: 2, minimum: 1 })
  attempts!: number;

  @ApiProperty({ example: 42, minimum: 0 })
  durationMs!: number;

  @ApiProperty({ enum: [AI_MODEL], example: AI_MODEL })
  model!: typeof AI_MODEL;

  @ApiProperty({ enum: [AI_PROVIDER], example: AI_PROVIDER })
  provider!: typeof AI_PROVIDER;

  @ApiProperty({ enum: ["low", "medium", "max"], example: "low" })
  reasoningEffort!: AiReasoningEffort;

  @ApiProperty({ nullable: true, type: Object })
  usage!: AiUsage | null;
}

export class GuestReviewResponseDto {
  @ApiProperty({ type: GuestReviewExecutionResponseDto })
  execution!: GuestReviewExecutionResponseDto;

  @ApiProperty({ type: Object })
  result!: ReviewResult;
}
