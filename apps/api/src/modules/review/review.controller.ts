import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadGatewayResponse,
  ApiBody,
  ApiConflictResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from "@nestjs/swagger";

import { AuthAccessGuard, type AuthenticatedRequest } from "../auth/auth-access.guard.js";
import { CreateReviewDto, ReviewIdParamDto, ReviewListQueryDto } from "./review.dto.js";
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
import { ReviewService } from "./review.service.js";

function getUserId(request: AuthenticatedRequest): string {
  if (!request.auth) {
    throw new UnauthorizedException();
  }

  return request.auth.userId;
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
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateReviewDto) {
    return this.reviews.create(getUserId(request), body);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: ReviewListQueryDto) {
    return this.reviews.list(getUserId(request), {
      limit: query.limit,
      page: query.page,
      ...(query.status ? { status: query.status } : {}),
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
  retry(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.reviews.retry(getUserId(request), id);
  }

  @Post(":id/cancel")
  cancel(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.reviews.cancel(getUserId(request), id);
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
      const outcome = await this.processing.process({
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
