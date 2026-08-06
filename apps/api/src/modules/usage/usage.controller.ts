import { Controller, Get, Query, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from "@nestjs/swagger";

import { AuthAccessGuard, type AuthenticatedRequest } from "../auth/auth-access.guard.js";
import {
  UsageHistoryQueryDto,
  UsageHistoryResponseDto,
  UsageQuotaResponseDto,
  UsageSummaryResponseDto,
} from "./usage.dto.js";
import { USAGE_MAX_HISTORY_PAGE_NUMBER, USAGE_MAX_HISTORY_PAGE_SIZE } from "./usage.read-model.js";
import { UsageService } from "./usage.service.js";

function getUserId(request: AuthenticatedRequest): string {
  if (!request.auth) {
    throw new UnauthorizedException();
  }

  return request.auth.userId;
}

function envelopeSchema(
  dto:
    typeof UsageSummaryResponseDto | typeof UsageHistoryResponseDto | typeof UsageQuotaResponseDto,
) {
  return {
    properties: { data: { $ref: getSchemaPath(dto) } },
    required: ["data"],
    type: "object",
  };
}

@ApiTags("usage")
@ApiExtraModels(UsageHistoryResponseDto, UsageQuotaResponseDto, UsageSummaryResponseDto)
@Controller("usage")
@UseGuards(AuthAccessGuard)
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get("summary")
  @ApiOkResponse({
    description:
      "Owned non-deleted review totals and token sums from owned completed persisted results.",
    schema: envelopeSchema(UsageSummaryResponseDto),
  })
  @ApiOperation({ summary: "Read the authenticated user's usage summary" })
  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  summary(@Req() request: AuthenticatedRequest) {
    return this.usage.summary(getUserId(request));
  }

  @Get("history")
  @ApiOkResponse({
    description:
      "Owned non-deleted review history. Source code is never included; usage fields are null when no usage row exists.",
    schema: envelopeSchema(UsageHistoryResponseDto),
  })
  @ApiOperation({ summary: "Read paginated authenticated-user usage history" })
  @ApiQuery({
    description: `1-${USAGE_MAX_HISTORY_PAGE_NUMBER}; integer query value only.`,
    maximum: USAGE_MAX_HISTORY_PAGE_NUMBER,
    minimum: 1,
    name: "page",
    required: false,
    type: Number,
  })
  @ApiQuery({
    description: `1-${USAGE_MAX_HISTORY_PAGE_SIZE}; integer query value only.`,
    maximum: USAGE_MAX_HISTORY_PAGE_SIZE,
    minimum: 1,
    name: "limit",
    required: false,
    type: Number,
  })
  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  history(@Req() request: AuthenticatedRequest, @Query() query: UsageHistoryQueryDto) {
    return this.usage.history(getUserId(request), query.page, query.limit);
  }

  @Get("quota")
  @ApiOkResponse({
    description:
      "Configuration-driven UTC-day review counts and remaining limits. This read model does not claim Redis enforcement.",
    schema: envelopeSchema(UsageQuotaResponseDto),
  })
  @ApiOperation({ summary: "Read the authenticated user's daily review quota" })
  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  quota(@Req() request: AuthenticatedRequest) {
    return this.usage.quota(getUserId(request));
  }
}
