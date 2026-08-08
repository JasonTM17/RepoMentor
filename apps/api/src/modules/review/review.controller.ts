import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  InternalServerErrorException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBadGatewayResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import type { Response } from "express";

import { AuthAccessGuard, type AuthenticatedRequest } from "../auth/auth-access.guard.js";
import {
  QuotaAdmissionConflictError,
  QuotaAdmissionInputError,
  QuotaAdmissionNotFoundError,
} from "../usage/quota-admission.errors.js";
import { QuotaAdmissionHttpService } from "../usage/quota-admission-http.service.js";
import {
  QuotaAdmissionFinalizerConflictError,
  QuotaAdmissionFinalizerNotFoundError,
  QuotaAdmissionRateLimitError,
  QuotaAdmissionUnavailableError,
} from "../usage/quota-admission-http.errors.js";
import {
  ReviewFinalizerConflictError,
  ReviewFinalizerIndeterminateError,
  ReviewFinalizerNotFoundError,
  ReviewFinalizerUnavailableError,
} from "../usage/review-finalizer.errors.js";
import {
  CreateReviewDto,
  ReviewBulkDeleteDto,
  ReviewIdParamDto,
  ReviewListQueryDto,
} from "./review.dto.js";
import {
  assertEmptyProcessBody,
  mapReviewProcessingError,
  ReviewProcessingAlreadyCompletedResponseDto,
  ReviewProcessingAlreadyProcessingResponseDto,
  ReviewProcessingCompletedResponseDto,
  ReviewResultResponseDto,
  toReviewProcessingResponse,
  toReviewResultResponse,
} from "./processing/review-processing.transport.js";
import { ReviewProcessingService } from "./processing/review-processing.service.js";
import { ReviewRunCoordinator } from "./processing/review-run.coordinator.js";
import { ReviewEventStreamService } from "./review-events.service.js";
import { ReviewService } from "./review.service.js";

const MAX_RETRY_AFTER_SECONDS = 86_400;

const reviewAdmissionSummarySchema = {
  properties: {
    data: {
      properties: {
        createdAt: { format: "date-time", type: "string" },
        id: { type: "string" },
        language: { type: "string" },
        mode: { enum: ["QUICK", "STANDARD", "DEEP"], type: "string" },
        learnerLevel: { enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED"], type: "string" },
        title: { type: "string" },
        context: { type: "string" },
        status: { type: "string" },
        updatedAt: { format: "date-time", type: "string" },
      },
      required: ["id", "language", "mode", "learnerLevel", "status", "createdAt", "updatedAt"],
      type: "object",
    },
  },
  required: ["data"],
  type: "object",
};

function getAuth(request: AuthenticatedRequest): NonNullable<AuthenticatedRequest["auth"]> {
  if (!request.auth) {
    throw new UnauthorizedException();
  }

  return request.auth;
}

function getUserId(request: AuthenticatedRequest): string {
  return getAuth(request).userId;
}

function boundedRetryAfterSeconds(value: number): number {
  if (!Number.isSafeInteger(value)) {
    return MAX_RETRY_AFTER_SECONDS;
  }

  return Math.min(Math.max(value, 1), MAX_RETRY_AFTER_SECONDS);
}

function mapQuotaAdmissionError(error: unknown, response: Response): never {
  if (error instanceof QuotaAdmissionInputError) {
    throw new BadRequestException();
  }

  if (
    error instanceof QuotaAdmissionConflictError ||
    error instanceof QuotaAdmissionFinalizerConflictError ||
    error instanceof ReviewFinalizerConflictError
  ) {
    throw new ConflictException();
  }

  if (error instanceof QuotaAdmissionRateLimitError) {
    response.setHeader("Retry-After", String(boundedRetryAfterSeconds(error.retryAfterSeconds)));
    throw new HttpException({}, HttpStatus.TOO_MANY_REQUESTS);
  }

  if (
    error instanceof QuotaAdmissionNotFoundError ||
    error instanceof QuotaAdmissionUnavailableError ||
    error instanceof QuotaAdmissionFinalizerNotFoundError ||
    error instanceof ReviewFinalizerIndeterminateError ||
    error instanceof ReviewFinalizerNotFoundError ||
    error instanceof ReviewFinalizerUnavailableError
  ) {
    throw new ServiceUnavailableException();
  }

  throw new InternalServerErrorException();
}

@Controller("reviews")
@UseGuards(AuthAccessGuard)
@ApiTags("reviews")
@ApiExtraModels(
  ReviewProcessingAlreadyCompletedResponseDto,
  ReviewProcessingAlreadyProcessingResponseDto,
  ReviewProcessingCompletedResponseDto,
  ReviewResultResponseDto,
)
export class ReviewController {
  constructor(
    private readonly reviews: ReviewService,
    private readonly processing: ReviewProcessingService,
    private readonly eventStream: ReviewEventStreamService,
    private readonly runCoordinator: ReviewRunCoordinator,
    private readonly quotaAdmission: QuotaAdmissionHttpService,
  ) {}

  @Post()
  @ApiHeader({
    description: "Required bounded idempotency key for this authenticated review admission.",
    name: "Idempotency-Key",
    required: true,
  })
  @ApiBadRequestResponse({ description: "The body or Idempotency-Key is invalid." })
  @ApiConflictResponse({ description: "The Idempotency-Key conflicts with an earlier request." })
  @ApiCreatedResponse({
    description: "A new authenticated review was admitted and created.",
    schema: reviewAdmissionSummarySchema,
  })
  @ApiOkResponse({
    description: "The authenticated review admission was replayed safely.",
    schema: reviewAdmissionSummarySchema,
  })
  @ApiTooManyRequestsResponse({
    description: "The authenticated review quota was reached; Retry-After is bounded.",
  })
  @ApiServiceUnavailableResponse({
    description: "Quota admission or review finalization is unavailable or indeterminate.",
  })
  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  async create(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateReviewDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const outcome = await this.quotaAdmission.create({
        idempotencyKey,
        language: body.language,
        learnerLevel: body.learnerLevel,
        mode: body.mode,
        ...(body.title === undefined ? {} : { title: body.title }),
        ...(body.context === undefined ? {} : { context: body.context }),
        source: body.source,
        userId: getUserId(request),
      });

      response.status(outcome.kind === "REPLAYED" ? HttpStatus.OK : HttpStatus.CREATED);
      return {
        createdAt: outcome.summary.createdAt,
        id: outcome.summary.id,
        language: outcome.summary.language,
        learnerLevel: outcome.summary.learnerLevel,
        mode: outcome.summary.mode,
        ...(outcome.summary.title === undefined ? {} : { title: outcome.summary.title }),
        ...(outcome.summary.context === undefined ? {} : { context: outcome.summary.context }),
        status: outcome.summary.status,
        updatedAt: outcome.summary.updatedAt,
      };
    } catch (error: unknown) {
      return mapQuotaAdmissionError(error, response);
    }
  }

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: ReviewListQueryDto) {
    return this.reviews.list(getUserId(request), {
      limit: query.limit,
      page: query.page,
      ...(query.title === undefined ? {} : { title: query.title }),
      ...(query.language === undefined ? {} : { language: query.language }),
      ...(query.mode === undefined ? {} : { mode: query.mode }),
      ...(query.status ? { status: query.status } : {}),
      sort: query.sort,
    });
  }

  @Delete()
  @ApiBody({
    description:
      "Soft-delete up to 100 unique owned review IDs. Missing and other-user IDs are ignored.",
    schema: {
      additionalProperties: false,
      properties: {
        ids: {
          items: { maxLength: 25, minLength: 1, type: "string" },
          maxItems: 100,
          minItems: 1,
          type: "array",
          uniqueItems: true,
        },
      },
      required: ["ids"],
      type: "object",
    },
  })
  @ApiOkResponse({
    description: "The count of active reviews soft-deleted for the authenticated user.",
    schema: {
      properties: { data: { properties: { deletedCount: { minimum: 0, type: "integer" } } } },
      required: ["data"],
      type: "object",
    },
  })
  @ApiBadRequestResponse({ description: "The body contains invalid, duplicate, or too many IDs." })
  async removeMany(@Req() request: AuthenticatedRequest, @Body() body: ReviewBulkDeleteDto) {
    return this.reviews.removeMany(getUserId(request), body.ids);
  }

  @Get(":id/events")
  @ApiHeader({
    description: "Optional durable event cursor. Events at or before this ID are not replayed.",
    name: "Last-Event-ID",
    required: false,
  })
  @ApiOkResponse({
    description:
      "Raw status-only server-sent events. Stale cursors receive one reset snapshot; terminal streams close.",
    content: {
      "text/event-stream": {
        schema: {
          example: 'id: 1\\nevent: snapshot\\ndata: {\\"type\\":\\"snapshot\\"}\\n\\n',
          type: "string",
        },
      },
    },
  })
  @ApiOperation({ summary: "Stream one owned review lifecycle" })
  @ApiConflictResponse({ description: "One lifecycle stream is already active for this review." })
  @ApiProduces("text/event-stream")
  @ApiNotFoundResponse({ description: "The owned review was not found." })
  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  async events(
    @Req() request: AuthenticatedRequest,
    @Param() params: ReviewIdParamDto,
    @Headers("last-event-id") lastEventId: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const auth = getAuth(request);

    await this.eventStream.stream({
      lastEventId,
      response,
      reviewId: params.id,
      sessionId: auth.sessionId,
      userId: auth.userId,
    });
  }

  @Get(":id")
  detail(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.reviews.detail(getUserId(request), id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: AuthenticatedRequest, @Param("id") id: string): Promise<void> {
    await this.reviews.remove(getUserId(request), id);
  }

  @Post(":id/retry")
  async retry(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    const userId = getUserId(request);
    await this.runCoordinator.waitForIdle(userId, id);
    return this.reviews.retry(userId, id);
  }

  @Post(":id/cancel")
  cancel(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    const userId = getUserId(request);
    this.runCoordinator.cancel(userId, id);
    return this.reviews.cancel(userId, id);
  }

  @Post(":id/process")
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    description: "The body must be empty; provider, model, and prompt are server-controlled.",
    required: false,
    schema: { additionalProperties: false, example: {}, type: "object" },
  })
  @ApiBadGatewayResponse({ description: "The Luna dependency could not complete the review." })
  @ApiConflictResponse({ description: "The review is not ready for a new processing run." })
  @ApiNotFoundResponse({ description: "The owned review was not found." })
  @ApiOkResponse({
    description: "The bounded processing run completed or was safely skipped.",
    schema: {
      properties: {
        data: {
          oneOf: [
            { $ref: getSchemaPath(ReviewProcessingCompletedResponseDto) },
            { $ref: getSchemaPath(ReviewProcessingAlreadyCompletedResponseDto) },
            { $ref: getSchemaPath(ReviewProcessingAlreadyProcessingResponseDto) },
          ],
        },
      },
      required: ["data"],
      type: "object",
    },
  })
  @ApiResponse({
    description: "Luna rate limit was reached; the response contains no provider details.",
    status: HttpStatus.TOO_MANY_REQUESTS,
  })
  @ApiResponse({
    description: "Luna is unavailable; the response contains no provider details.",
    status: HttpStatus.SERVICE_UNAVAILABLE,
  })
  @ApiResponse({
    description: "Luna timed out; the response contains no provider details.",
    status: HttpStatus.GATEWAY_TIMEOUT,
  })
  @ApiOperation({ summary: "Process one owned review through pinned Luna" })
  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  async process(
    @Req() request: AuthenticatedRequest,
    @Param() params: ReviewIdParamDto,
    @Body() body: unknown,
  ) {
    assertEmptyProcessBody(body);

    try {
      const outcome = await this.runCoordinator.process({
        reviewId: params.id,
        userId: getUserId(request),
      });
      return toReviewProcessingResponse(outcome);
    } catch (error: unknown) {
      throw mapReviewProcessingError(error);
    }
  }

  @Get(":id/result")
  @ApiConflictResponse({ description: "The review has no completed persisted result yet." })
  @ApiNotFoundResponse({ description: "The owned review was not found." })
  @ApiOkResponse({
    description: "The validated persisted review result and safe execution data.",
    schema: {
      properties: {
        data: { $ref: getSchemaPath(ReviewResultResponseDto) },
      },
      required: ["data"],
      type: "object",
    },
  })
  @ApiOperation({ summary: "Read one owned completed review result" })
  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  async result(@Req() request: AuthenticatedRequest, @Param() params: ReviewIdParamDto) {
    try {
      const result = await this.processing.getResult({
        reviewId: params.id,
        userId: getUserId(request),
      });
      return toReviewResultResponse(result);
    } catch (error: unknown) {
      throw mapReviewProcessingError(error);
    }
  }
}
