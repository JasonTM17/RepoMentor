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
} from "class-validator";

import {
  REVIEW_MAX_LANGUAGE_LENGTH,
  REVIEW_MAX_PAGE_NUMBER,
  REVIEW_MAX_PAGE_SIZE,
  REVIEW_MAX_SOURCE_LENGTH,
  REVIEW_MODES,
  REVIEW_STATUSES,
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

  @IsOptional()
  @IsIn(REVIEW_MODES)
  mode?: ReviewMode;
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
