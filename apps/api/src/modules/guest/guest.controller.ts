import {
  BadGatewayException,
  Body,
  ConflictException,
  Controller,
  GatewayTimeoutException,
  HttpException,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import type { Request, Response } from "express";

import { AiProviderError, AiRequestError, AiValidationError } from "../ai/ai.errors.js";
import {
  GuestReviewExecutionResponseDto,
  GuestReviewDto,
  GuestReviewResponseDto,
  guestReviewRequestSchema,
} from "./guest.dto.js";
import { GuestReviewRateLimitError, GuestReviewUnavailableError } from "./guest.errors.js";
import { GuestReviewService } from "./guest.service.js";

const guestReviewEnvelopeSchema = {
  properties: {
    data: { $ref: getSchemaPath(GuestReviewResponseDto) },
  },
  required: ["data"],
  type: "object",
};

export function mapGuestReviewError(error: unknown, response: Response): HttpException {
  if (error instanceof GuestReviewRateLimitError) {
    response.setHeader("Retry-After", String(error.retryAfterSeconds));
    return new HttpException({}, HttpStatus.TOO_MANY_REQUESTS);
  }

  if (error instanceof GuestReviewUnavailableError) {
    return new ServiceUnavailableException();
  }

  if (error instanceof AiProviderError) {
    switch (error.code) {
      case "RATE_LIMITED":
        return new HttpException({}, HttpStatus.TOO_MANY_REQUESTS);
      case "TIMEOUT":
        return new GatewayTimeoutException();
      case "UNAVAILABLE":
      case "CONFIGURATION":
        return new ServiceUnavailableException();
      case "CANCELLED":
        return new ConflictException();
      default:
        return new BadGatewayException();
    }
  }

  if (error instanceof AiRequestError || error instanceof AiValidationError) {
    return new BadGatewayException();
  }

  return new InternalServerErrorException();
}

@Controller("guest/reviews")
@ApiTags("guest")
@ApiExtraModels(GuestReviewExecutionResponseDto, GuestReviewResponseDto)
export class GuestReviewController {
  constructor(private readonly guestReviews: GuestReviewService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Run one public QUICK review through pinned Luna" })
  @ApiBody({
    description:
      "Only source and language are accepted; QUICK, provider, model, and reasoning are server-controlled.",
    schema: guestReviewRequestSchema,
  })
  @ApiOkResponse({
    description: "The transient guest QUICK review completed without persistence or history.",
    schema: guestReviewEnvelopeSchema,
  })
  @ApiBadRequestResponse({
    description: "The body contains only source and language, both strictly validated.",
  })
  @ApiTooManyRequestsResponse({
    description: "The per-identity guest QUICK quota was reached; Retry-After is bounded.",
  })
  @ApiResponse({
    description: "The pinned Luna dependency returned a safe dependency failure.",
    status: HttpStatus.BAD_GATEWAY,
  })
  @ApiResponse({
    description: "The pinned Luna dependency timed out.",
    status: HttpStatus.GATEWAY_TIMEOUT,
  })
  @ApiResponse({
    description: "Guest identity, Redis quota, or Luna configuration is unavailable.",
    status: HttpStatus.SERVICE_UNAVAILABLE,
  })
  async create(
    @Req() request: Request,
    @Body() body: GuestReviewDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return await this.guestReviews.review(body, request.socket.remoteAddress);
    } catch (error: unknown) {
      throw mapGuestReviewError(error, response);
    }
  }
}
