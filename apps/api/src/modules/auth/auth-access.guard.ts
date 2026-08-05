import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import { AuthTokenService } from "./auth-token.service.js";
import { AUTH_REPOSITORY } from "./auth.types.js";
import type { AuthRepository, AuthContext } from "./auth.types.js";

export type AuthenticatedRequest = Request & { auth?: AuthContext };

function unauthorized(): UnauthorizedException {
  return new UnauthorizedException();
}

@Injectable()
export class AuthAccessGuard implements CanActivate {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository,
    private readonly tokens: AuthTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header("authorization");
    const token = authorization?.match(/^Bearer\s+([^\s]+)$/i)?.[1];

    if (!token) {
      throw unauthorized();
    }

    let claims;

    try {
      claims = this.tokens.verifyAccessToken(token);
    } catch {
      throw unauthorized();
    }

    const [session, user] = await Promise.all([
      this.repository.findSessionById(claims.sessionId),
      this.repository.findUserById(claims.subject),
    ]);

    if (
      !session ||
      !user ||
      session.userId !== user.id ||
      session.status !== "ACTIVE" ||
      user.status !== "ACTIVE"
    ) {
      throw unauthorized();
    }

    request.auth = {
      sessionId: session.id,
      userId: user.id,
    };
    return true;
  }
}
