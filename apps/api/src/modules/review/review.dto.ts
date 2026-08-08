import { Transform } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

import {
  REVIEW_LEARNER_LEVELS,
  REVIEW_MAX_CONTEXT_LENGTH,
  REVIEW_MAX_LANGUAGE_LENGTH,
  REVIEW_MAX_PAGE_NUMBER,
  REVIEW_MAX_PAGE_SIZE,
  REVIEW_MAX_SOURCE_LENGTH,
  REVIEW_MAX_TITLE_LENGTH,
  REVIEW_MODES,
  REVIEW_STATUSES,
  type ReviewLearnerLevel,
  type ReviewMode,
  type ReviewStatus,
} from "./review.types.js";

const trimLowercase = ({ value }: { readonly value: unknown }): unknown =>
  typeof value === "string" ? value.trim().toLowerCase() : value;

const toInteger = ({ value }: { readonly value: unknown }): unknown => {
  if (typeof value !== "string" || value.trim() === "") {
    return value;
  }

  return Number(value);
};

export class CreateReviewDto {
  @IsString()
  @MinLength(1)
  @MaxLength(REVIEW_MAX_SOURCE_LENGTH)
  @Matches(/\S/u)
  source!: string;

  @Transform(trimLowercase)
  @IsString()
  @MinLength(1)
  @MaxLength(REVIEW_MAX_LANGUAGE_LENGTH)
  @Matches(/^[a-z0-9#+._-]+$/u)
  language!: string;

  @IsIn(REVIEW_LEARNER_LEVELS)
  learnerLevel!: ReviewLearnerLevel;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(REVIEW_MODES)
  mode?: ReviewMode;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(REVIEW_MAX_TITLE_LENGTH)
  @Matches(/\S/u)
  title?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(REVIEW_MAX_CONTEXT_LENGTH)
  @Matches(/\S/u)
  context?: string;
}

export class ReviewListQueryDto {
  @Transform(toInteger)
  @IsInt()
  @Min(1)
  @Max(REVIEW_MAX_PAGE_NUMBER)
  page = 1;

  @Transform(toInteger)
  @IsInt()
  @Min(1)
  @Max(REVIEW_MAX_PAGE_SIZE)
  limit = 20;

  @IsOptional()
  @IsIn(REVIEW_STATUSES)
  status?: ReviewStatus;
}

export class ReviewIdParamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(25)
  id!: string;
}
