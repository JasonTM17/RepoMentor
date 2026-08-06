import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";

import { AI_MODEL, AI_PROVIDER, type AiUsage } from "../../ai/ai.types.js";
import {
  validatePersistedAiReviewExecution,
  type ReviewResultRecord,
} from "../review-result.persistence.js";
import { ReviewProcessingBoundaryError } from "./review-processing.errors.js";
import type { ReviewProcessingOutcome } from "./review-processing.types.js";
import type { ReviewResult } from "../../ai/review-result.schema.js";

export type ReviewProcessingResponse =
  | {
      readonly id: string;
      readonly outcome: "COMPLETED";
      readonly resultAvailable: true;
      readonly status: "COMPLETED";
    }
  | {
      readonly id: string;
      readonly outcome: "SKIPPED";
      readonly reason: "ALREADY_COMPLETED";
      readonly resultAvailable: true;
      readonly status: "COMPLETED";
    }
  | {
      readonly id: string;
      readonly outcome: "SKIPPED";
      readonly reason: "ALREADY_PROCESSING";
      readonly resultAvailable: false;
      readonly status: "PROCESSING";
    };

export interface ReviewResultExecutionResponse {
  readonly attempts: number;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly model: typeof AI_MODEL;
  readonly provider: typeof AI_PROVIDER;
  readonly reasoningEffort: "low" | "medium" | "max";
  readonly usage: AiUsage | null;
}

export interface ReviewResultResponse {
  readonly execution: ReviewResultExecutionResponse;
  readonly id: string;
  readonly result: ReviewResult;
  readonly status: "COMPLETED";
}

export class ReviewProcessingCompletedResponseDto {
  @ApiProperty({ example: "clreview123456789012345678" })
  id!: string;

  @ApiProperty({ enum: ["COMPLETED"], example: "COMPLETED" })
  outcome!: "COMPLETED";

  @ApiProperty({ example: true })
  resultAvailable!: true;

  @ApiProperty({ enum: ["COMPLETED"], example: "COMPLETED" })
  status!: "COMPLETED";
}

export class ReviewProcessingAlreadyCompletedResponseDto {
  @ApiProperty({ example: "clreview123456789012345678" })
  id!: string;

  @ApiProperty({ enum: ["SKIPPED"], example: "SKIPPED" })
  outcome!: "SKIPPED";

  @ApiProperty({ enum: ["ALREADY_COMPLETED"], example: "ALREADY_COMPLETED" })
  reason!: "ALREADY_COMPLETED";

  @ApiProperty({ example: true })
  resultAvailable!: true;

  @ApiProperty({ enum: ["COMPLETED"], example: "COMPLETED" })
  status!: "COMPLETED";
}

export class ReviewProcessingAlreadyProcessingResponseDto {
  @ApiProperty({ example: "clreview123456789012345678" })
  id!: string;

  @ApiProperty({ enum: ["SKIPPED"], example: "SKIPPED" })
  outcome!: "SKIPPED";

  @ApiProperty({ enum: ["ALREADY_PROCESSING"], example: "ALREADY_PROCESSING" })
  reason!: "ALREADY_PROCESSING";

  @ApiProperty({ example: false })
  resultAvailable!: false;

  @ApiProperty({ enum: ["PROCESSING"], example: "PROCESSING" })
  status!: "PROCESSING";
}

export class ReviewResultExecutionResponseDto {
  @ApiProperty({ example: 1, minimum: 1, maximum: 2 })
  attempts!: number;

  @ApiProperty({ example: "2026-08-06T02:00:00.000Z", format: "date-time" })
  completedAt!: string;

  @ApiProperty({ example: 42, minimum: 0 })
  durationMs!: number;

  @ApiProperty({ enum: [AI_MODEL], example: AI_MODEL })
  model!: typeof AI_MODEL;

  @ApiProperty({ enum: [AI_PROVIDER], example: AI_PROVIDER })
  provider!: typeof AI_PROVIDER;

  @ApiProperty({ enum: ["low", "medium", "max"], example: "max" })
  reasoningEffort!: "low" | "medium" | "max";

  @ApiProperty({ nullable: true, type: Object })
  usage!: AiUsage | null;
}

export class ReviewResultResponseDto {
  @ApiProperty({ type: ReviewResultExecutionResponseDto })
  execution!: ReviewResultExecutionResponseDto;

  @ApiProperty({ example: "clreview123456789012345678" })
  id!: string;

  @ApiProperty({ type: Object })
  result!: ReviewResult;

  @ApiProperty({ enum: ["COMPLETED"], example: "COMPLETED" })
  status!: "COMPLETED";
}

export function assertEmptyProcessBody(body: unknown): void {
  if (body === undefined || body === null) {
    return;
  }

  if (typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0) {
    throw new BadRequestException();
  }
}

export function toReviewProcessingResponse(
  outcome: ReviewProcessingOutcome,
): ReviewProcessingResponse {
  switch (outcome.kind) {
    case "COMPLETED":
      return {
        id: outcome.review.id,
        outcome: "COMPLETED",
        resultAvailable: true,
        status: "COMPLETED",
      };
    case "FAILED":
      if (outcome.failure.code === "INTERNAL") {
        throw new InternalServerErrorException();
      }

      switch (outcome.failure.providerCode) {
        case "RATE_LIMITED":
          throw new HttpException({}, HttpStatus.TOO_MANY_REQUESTS);
        case "TIMEOUT":
          throw new GatewayTimeoutException();
        case "UNAVAILABLE":
          throw new ServiceUnavailableException();
        default:
          break;
      }

      throw new BadGatewayException();
    case "CANCELLED":
      throw new ConflictException();
    case "SKIPPED":
      if (outcome.reason === "ALREADY_COMPLETED") {
        return {
          id: outcome.review.id,
          outcome: "SKIPPED",
          reason: "ALREADY_COMPLETED",
          resultAvailable: true,
          status: "COMPLETED",
        };
      }

      if (outcome.reason === "ALREADY_PROCESSING") {
        return {
          id: outcome.review.id,
          outcome: "SKIPPED",
          reason: "ALREADY_PROCESSING",
          resultAvailable: false,
          status: "PROCESSING",
        };
      }

      throw new ConflictException();
  }
}

export function toReviewResultResponse(record: ReviewResultRecord): ReviewResultResponse {
  const execution = validatePersistedAiReviewExecution({
    attempts: record.attempts,
    durationMs: record.durationMs,
    model: record.model,
    provider: record.provider,
    reasoningEffort: record.reasoningEffort,
    result: record.result,
    ...(record.usage === null ? {} : { usage: record.usage }),
  });

  return {
    execution: {
      attempts: execution.attempts,
      completedAt: record.createdAt.toISOString(),
      durationMs: execution.durationMs,
      model: execution.model,
      provider: execution.provider,
      reasoningEffort: execution.reasoningEffort,
      usage: record.usage,
    },
    id: record.reviewId,
    result: execution.result,
    status: "COMPLETED",
  };
}

export function mapReviewProcessingError(error: unknown): HttpException {
  if (error instanceof HttpException) {
    return error;
  }

  if (error instanceof ReviewProcessingBoundaryError) {
    switch (error.code) {
      case "REVIEW_NOT_FOUND":
        return new NotFoundException();
      case "CLAIM_CONFLICT":
      case "FINALIZATION_CONFLICT":
      case "RESULT_NOT_READY":
        return new ConflictException();
      case "RESULT_UNAVAILABLE":
        return new InternalServerErrorException();
    }
  }

  return new InternalServerErrorException();
}
