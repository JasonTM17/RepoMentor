import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { AuthAccessGuard, type AuthenticatedRequest } from "./auth-access.guard.js";
import { LoginDto, RegisterDto } from "./auth.dto.js";
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
  const response = { ...result } as Omit<AuthResult, "refreshToken"> & {
    refreshToken?: string;
  };

  delete response.refreshToken;
  return response;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: AuthTokenService,
  ) {}

  @Post("register")
  async register(
    @Body() body: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.register(
      body.email,
      body.displayName,
      body.password,
      getSessionMetadata(request),
    );
    this.setRefreshCookie(response, result.refreshToken);
    return publicResult(result);
  }

  @Post("login")
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

  private setRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie(REFRESH_COOKIE_NAME, refreshToken, this.tokens.getRefreshCookieOptions());
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, this.tokens.getRefreshCookieClearOptions());
  }
}
