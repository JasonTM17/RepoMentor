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

import { AuthAccessGuard, type AuthenticatedRequest } from "../auth/auth-access.guard.js";
import { CreateReviewDto, ReviewListQueryDto } from "./review.dto.js";
import { ReviewService } from "./review.service.js";

function getUserId(request: AuthenticatedRequest): string {
  if (!request.auth) {
    throw new UnauthorizedException();
  }

  return request.auth.userId;
}

@Controller("reviews")
@UseGuards(AuthAccessGuard)
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

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
}
