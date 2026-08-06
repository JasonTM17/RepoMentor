import { Transform } from "class-transformer";
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import {
  REVIEW_MAX_LANGUAGE_LENGTH,
  REVIEW_MODES,
  REVIEW_STATUSES,
} from "../review/review.types.js";
import { parseStrictUtcDateTime } from "./usage.date.js";
import {
  USAGE_MAX_HISTORY_PAGE_NUMBER,
  USAGE_MAX_HISTORY_PAGE_SIZE,
  USAGE_MAX_HISTORY_SEARCH_LENGTH,
} from "./usage.read-model.js";
import { USAGE_HISTORY_SORT_ORDERS, type UsageHistorySortOrder } from "./usage.types.js";

function toStrictInteger({ value }: { readonly value: unknown }): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalizedValue = value.trim();

  return /^\d+$/u.test(normalizedValue) ? Number(normalizedValue) : value;
}

function normalizeFilterText({ value }: { readonly value: unknown }): unknown {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

function toStrictUtcDate({ value }: { readonly value: unknown }): unknown {
  if (typeof value !== "string") {
    return value;
  }

  return parseStrictUtcDateTime(value) ?? new Date(Number.NaN);
}

@ValidatorConstraint({ name: "usageHistoryDateRange", async: false })
class UsageHistoryDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const query = args.object as { readonly from?: unknown; readonly to?: unknown };

    if (!(query.from instanceof Date) || !(query.to instanceof Date)) {
      return true;
    }

    const from = query.from.getTime();
    const to = query.to.getTime();

    return !Number.isFinite(from) || !Number.isFinite(to) || from < to;
  }

  defaultMessage(): string {
    return "from must be earlier than to.";
  }
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

  @ApiPropertyOptional({
    description: "Exact normalized programming-language metadata value.",
    example: "typescript",
    maxLength: REVIEW_MAX_LANGUAGE_LENGTH,
    minLength: 1,
  })
  @Transform(normalizeFilterText)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(REVIEW_MAX_LANGUAGE_LENGTH)
  @Matches(/^[a-z0-9#+._-]+$/u)
  language?: string;

  @ApiPropertyOptional({ enum: REVIEW_MODES, example: "STANDARD" })
  @IsOptional()
  @IsString()
  @IsIn(REVIEW_MODES)
  mode?: (typeof REVIEW_MODES)[number];

  @ApiPropertyOptional({
    description:
      "Bounded case-insensitive substring search over persisted review IDs only; source and title are never searched.",
    example: "clreview",
    maxLength: USAGE_MAX_HISTORY_SEARCH_LENGTH,
    minLength: 1,
  })
  @Transform(normalizeFilterText)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(USAGE_MAX_HISTORY_SEARCH_LENGTH)
  @Matches(/^[a-z0-9_-]+$/u)
  search?: string;

  @ApiPropertyOptional({
    default: "desc",
    description: "Sort by createdAt; id is the stable tie-breaker.",
    enum: USAGE_HISTORY_SORT_ORDERS,
    example: "desc",
  })
  @IsIn(USAGE_HISTORY_SORT_ORDERS)
  sort: UsageHistorySortOrder = "desc";

  @ApiPropertyOptional({
    description: "Inclusive UTC ISO date-time lower bound. Local dates and offsets are rejected.",
    example: "2026-08-06T00:00:00.000Z",
    format: "date-time",
    type: String,
  })
  @Transform(toStrictUtcDate)
  @IsOptional()
  @IsDate()
  @Validate(UsageHistoryDateRangeConstraint)
  from?: Date;

  @ApiPropertyOptional({
    description: "Exclusive UTC ISO date-time upper bound. Local dates and offsets are rejected.",
    example: "2026-08-07T00:00:00.000Z",
    format: "date-time",
    type: String,
  })
  @Transform(toStrictUtcDate)
  @IsOptional()
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ enum: REVIEW_STATUSES, example: "COMPLETED" })
  @IsOptional()
  @IsString()
  @IsIn(REVIEW_STATUSES)
  status?: (typeof REVIEW_STATUSES)[number];
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
