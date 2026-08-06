import { Transform } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { REVIEW_MODES, REVIEW_STATUSES } from "../review/review.types.js";
import { USAGE_MAX_HISTORY_PAGE_NUMBER, USAGE_MAX_HISTORY_PAGE_SIZE } from "./usage.read-model.js";

function toStrictInteger({ value }: { readonly value: unknown }): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalizedValue = value.trim();

  return /^\d+$/u.test(normalizedValue) ? Number(normalizedValue) : value;
}

export class UsageHistoryQueryDto {
  @ApiPropertyOptional({
    default: 1,
    maximum: USAGE_MAX_HISTORY_PAGE_NUMBER,
    minimum: 1,
    type: Number,
  })
  @Transform(toStrictInteger)
  @IsInt()
  @Min(1)
  @Max(USAGE_MAX_HISTORY_PAGE_NUMBER)
  page = 1;

  @ApiPropertyOptional({
    default: 20,
    maximum: USAGE_MAX_HISTORY_PAGE_SIZE,
    minimum: 1,
    type: Number,
  })
  @Transform(toStrictInteger)
  @IsInt()
  @Min(1)
  @Max(USAGE_MAX_HISTORY_PAGE_SIZE)
  limit = 20;
}

export class UsageStatusCountsDto {
  @ApiProperty({ example: 0, minimum: 0, type: Number })
  CANCELLED!: number;

  @ApiProperty({ example: 2, minimum: 0, type: Number })
  COMPLETED!: number;

  @ApiProperty({ example: 0, minimum: 0, type: Number })
  FAILED!: number;

  @ApiProperty({ example: 1, minimum: 0, type: Number })
  PENDING!: number;

  @ApiProperty({ example: 0, minimum: 0, type: Number })
  PROCESSING!: number;
}

export class UsageLanguageDistributionDto {
  @ApiProperty({ example: 3, minimum: 0, type: Number })
  count!: number;

  @ApiProperty({ example: "typescript", maxLength: 32 })
  language!: string;
}

export class UsageSummaryResponseDto {
  @ApiProperty({ example: "2026-08-06T02:00:00.000Z", format: "date-time" })
  asOf!: string;

  @ApiProperty({
    description: "Owned non-deleted reviews with COMPLETED status.",
    example: 2,
    minimum: 0,
    type: Number,
  })
  completedReviews!: number;

  @ApiProperty({
    description: "Owned non-deleted reviews using DEEP mode, regardless of terminal status.",
    example: 1,
    minimum: 0,
    type: Number,
  })
  deepReviews!: number;

  @ApiProperty({
    description: "Sum of inputTokens from owned completed ReviewUsage rows.",
    example: 120,
    minimum: 0,
    type: Number,
  })
  inputTokens!: number;

  @ApiProperty({ type: [UsageLanguageDistributionDto] })
  languageDistribution!: readonly UsageLanguageDistributionDto[];

  @ApiProperty({
    description: "Sum of outputTokens from owned completed ReviewUsage rows.",
    example: 90,
    minimum: 0,
    type: Number,
  })
  outputTokens!: number;

  @ApiProperty({ type: UsageStatusCountsDto })
  reviewsByStatus!: UsageStatusCountsDto;

  @ApiProperty({
    description: "Sum of totalTokens from owned completed ReviewUsage rows.",
    example: 210,
    minimum: 0,
    type: Number,
  })
  totalTokens!: number;

  @ApiProperty({ example: 3, minimum: 0, type: Number })
  totalReviews!: number;
}

export class UsageHistoryItemDto {
  @ApiProperty({ example: "2026-08-06T01:30:00.000Z", format: "date-time" })
  createdAt!: string;

  @ApiProperty({
    description: "Persisted duration; null until a result exists.",
    nullable: true,
    example: 42,
    type: Number,
  })
  durationMs!: number | null;

  @ApiProperty({
    description: "Null when no persisted ReviewUsage row exists.",
    example: 120,
    nullable: true,
    type: Number,
  })
  inputTokens!: number | null;

  @ApiProperty({ example: "typescript", maxLength: 32 })
  language!: string;

  @ApiProperty({ enum: REVIEW_MODES, example: "STANDARD" })
  mode!: string;

  @ApiProperty({
    description: "Null when no persisted ReviewUsage row exists.",
    example: 90,
    nullable: true,
    type: Number,
  })
  outputTokens!: number | null;

  @ApiProperty({ example: "clreview123456789012345678", minLength: 1 })
  reviewId!: string;

  @ApiProperty({ enum: REVIEW_STATUSES, example: "COMPLETED" })
  status!: string;

  @ApiProperty({
    description: "Null when no persisted ReviewUsage row exists.",
    example: 210,
    nullable: true,
    type: Number,
  })
  totalTokens!: number | null;
}

export class UsageHistoryMetaDto {
  @ApiProperty({ example: false })
  hasNext!: boolean;

  @ApiProperty({ example: false })
  hasPrevious!: boolean;

  @ApiProperty({ example: 20, minimum: 1, type: Number })
  limit!: number;

  @ApiProperty({ example: 1, minimum: 1, type: Number })
  page!: number;

  @ApiProperty({ example: 1, minimum: 0, type: Number })
  total!: number;

  @ApiProperty({ example: 1, minimum: 0, type: Number })
  totalPages!: number;
}

export class UsageHistoryResponseDto {
  @ApiProperty({ type: [UsageHistoryItemDto] })
  items!: readonly UsageHistoryItemDto[];

  @ApiProperty({ type: UsageHistoryMetaDto })
  meta!: UsageHistoryMetaDto;
}

export class UsageQuotaModeDto {
  @ApiProperty({ example: 20, minimum: 0, type: Number })
  limit!: number;

  @ApiProperty({ example: 19, minimum: 0, type: Number })
  remaining!: number;

  @ApiProperty({ example: 1, minimum: 0, type: Number })
  used!: number;
}

export class UsageQuotaModesDto {
  @ApiProperty({ type: UsageQuotaModeDto })
  DEEP!: UsageQuotaModeDto;

  @ApiProperty({ type: UsageQuotaModeDto })
  QUICK!: UsageQuotaModeDto;

  @ApiProperty({ type: UsageQuotaModeDto })
  STANDARD!: UsageQuotaModeDto;
}

export class UsageQuotaResponseDto {
  @ApiProperty({ example: "2026-08-06T02:00:00.000Z", format: "date-time" })
  asOf!: string;

  @ApiProperty({
    description: "Used counts all owned review records created during utcDay, by mode.",
    type: UsageQuotaModesDto,
  })
  modes!: UsageQuotaModesDto;

  @ApiProperty({ example: "2026-08-06" })
  utcDay!: string;
}
