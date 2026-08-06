import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

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
  readonly completedAt: Date;
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
      completedAt: record.createdAt,
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
