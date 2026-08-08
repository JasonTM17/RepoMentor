import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import type { Request, Response } from "express";

import { AuthAccessGuard, type AuthenticatedRequest } from "./auth-access.guard.js";
import { ChangePasswordDto, ChangePasswordResponseDto, LoginDto, RegisterDto } from "./auth.dto.js";
import { authRateLimit, AuthRateLimitGuard } from "./auth-rate-limiter.js";
import { AuthService, type AuthResult } from "./auth.service.js";
import { AuthTokenService, REFRESH_COOKIE_NAME } from "./auth-token.service.js";
import { readCookie } from "./cookie.util.js";

function getSessionMetadata(request: Request) {
  const ipAddress = request.ip;
  const userAgent = request.get("user-agent");

  return {
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}

function publicResult(result: AuthResult) {
  return {
    accessToken: result.accessToken,
    expiresInSeconds: result.expiresInSeconds,
    tokenType: result.tokenType,
    user: result.user,
  };
}

@ApiTags("auth")
@ApiExtraModels(ChangePasswordResponseDto)
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: AuthTokenService,
  ) {}

  @Post("register")
  @UseGuards(AuthRateLimitGuard)
  @authRateLimit("register")
  @HttpCode(HttpStatus.ACCEPTED)
  async register(@Body() body: RegisterDto) {
    return this.auth.register(body.email, body.displayName, body.password);
  }

  @Post("login")
  @UseGuards(AuthRateLimitGuard)
  @authRateLimit("login")
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body.email, body.password, getSessionMetadata(request));
    this.setRefreshCookie(response, result.refreshToken);
    return publicResult(result);
  }

  @Post("refresh")
  @UseGuards(AuthRateLimitGuard)
  @authRateLimit("refresh")
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = readCookie(request.headers.cookie, REFRESH_COOKIE_NAME);

    try {
      const result = await this.auth.refresh(refreshToken);
      this.setRefreshCookie(response, result.refreshToken);
      return publicResult(result);
    } catch (error: unknown) {
      this.clearRefreshCookie(response);
      throw error;
    }
  }

  @Post("logout")
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = readCookie(request.headers.cookie, REFRESH_COOKIE_NAME);
    await this.auth.logout(refreshToken);
    this.clearRefreshCookie(response);
    return { loggedOut: true };
  }

  @UseGuards(AuthAccessGuard)
  @Post("logout-all")
  async logoutAll(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!request.auth) {
      throw new UnauthorizedException();
    }

    await this.auth.logoutAll(request.auth.userId);
    this.clearRefreshCookie(response);
    return { loggedOut: true };
  }

  @UseGuards(AuthAccessGuard)
  @Get("me")
  async me(@Req() request: AuthenticatedRequest) {
    if (!request.auth) {
      throw new UnauthorizedException();
    }

    return this.auth.me(request.auth);
  }

  @Patch("password")
  @UseGuards(AuthAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({
    description:
      "The password was changed. All active sessions are revoked and the caller must authenticate again.",
    schema: {
      properties: { data: { $ref: getSchemaPath(ChangePasswordResponseDto) } },
      required: ["data"],
      type: "object",
    },
  })
  @ApiBadRequestResponse({ description: "The password body or confirmation is invalid." })
  @ApiUnauthorizedResponse({ description: "Authentication or the current password is invalid." })
  @ApiOperation({ summary: "Change the authenticated user's password" })
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() body: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!request.auth) {
      throw new UnauthorizedException();
    }

    const result = await this.auth.changePassword(
      request.auth,
      body.currentPassword,
      body.newPassword,
      body.newPasswordConfirmation,
    );
    this.clearRefreshCookie(response);
    return result;
  }

  private setRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie(REFRESH_COOKIE_NAME, refreshToken, this.tokens.getRefreshCookieOptions());
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, this.tokens.getRefreshCookieClearOptions());
  }
}
