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
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { AuthAccessGuard, type AuthenticatedRequest } from "../auth/auth-access.guard.js";
import { CreateReviewDto, ReviewIdParamDto, ReviewListQueryDto } from "./review.dto.js";
import {
  assertEmptyProcessBody,
  mapReviewProcessingError,
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
  @ApiBadGatewayResponse({ description: "The Luna dependency could not complete the review." })
  @ApiConflictResponse({ description: "The review is not ready for a new processing run." })
  @ApiNotFoundResponse({ description: "The owned review was not found." })
  @ApiOkResponse({ description: "The bounded processing run completed or was safely skipped." })
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
  @ApiOkResponse({ description: "The validated persisted review result and safe execution data." })
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
