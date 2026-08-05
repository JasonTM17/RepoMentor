import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { createAuthId } from "./auth-id.js";
import { AuthTokenService } from "./auth-token.service.js";
import { AuthUserConflictError } from "./auth.types.js";
import type {
  AuthRepository,
  AuthSessionMetadata,
  AuthUserRecord,
  AuthContext,
  CreateSessionInput,
} from "./auth.types.js";
import { AUTH_REPOSITORY } from "./auth.types.js";
import { PasswordHasherService } from "./password-hasher.service.js";

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const MAX_DISPLAY_NAME_LENGTH = 100;
const MAX_USER_AGENT_LENGTH = 512;

export interface PublicAuthUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: AuthUserRecord["role"];
  readonly status: AuthUserRecord["status"];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AuthResult {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly refreshToken: string;
  readonly user: PublicAuthUser;
}

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeDisplayName(displayName: string): string {
  return displayName.trim();
}

function assertRegistrationInput(password: string, displayName: string): void {
  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH ||
    displayName.length < 1 ||
    displayName.length > MAX_DISPLAY_NAME_LENGTH
  ) {
    throw new BadRequestException();
  }
}

function safeUser(user: AuthUserRecord): PublicAuthUser {
  return {
    createdAt: user.createdAt,
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    role: user.role,
    status: user.status,
    updatedAt: user.updatedAt,
  };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository,
    private readonly passwordHasher: PasswordHasherService,
    private readonly tokens: AuthTokenService,
  ) {}

  async register(
    email: string,
    displayName: string,
    password: string,
    metadata: AuthSessionMetadata,
    now = new Date(),
  ): Promise<AuthResult> {
    const normalizedEmail = normalizeEmail(email);
    const normalizedDisplayName = normalizeDisplayName(displayName);
    assertRegistrationInput(password, normalizedDisplayName);

    if (await this.repository.findUserByEmail(normalizedEmail)) {
      throw new ConflictException();
    }

    const userId = createAuthId(now.getTime());
    const sessionId = createAuthId(now.getTime());
    const refreshToken = this.tokens.issueRefreshToken(userId, sessionId, now);
    const accessToken = this.tokens.issueAccessToken(userId, sessionId, now);
    const passwordHash = await this.passwordHasher.hashPassword(password);

    try {
      const result = await this.repository.createUserWithSession({
        session: this.createSessionInput(
          userId,
          sessionId,
          refreshToken.value,
          refreshToken.expiresAt,
          metadata,
          now,
        ),
        user: {
          displayName: normalizedDisplayName,
          email: normalizedEmail,
          id: userId,
          passwordHash,
          role: "USER",
          status: "ACTIVE",
        },
      });

      return this.toAuthResult(result.user, accessToken, refreshToken);
    } catch (error: unknown) {
      if (error instanceof AuthUserConflictError) {
        throw new ConflictException();
      }

      throw error;
    }
  }

  async login(
    email: string,
    password: string,
    metadata: AuthSessionMetadata,
    now = new Date(),
  ): Promise<AuthResult> {
    const user = await this.repository.findUserByEmail(normalizeEmail(email));
    const isValid = await this.passwordHasher.verifyPassword(password, user?.passwordHash);

    if (!user || !isValid || user.status !== "ACTIVE") {
      throw invalidCredentials();
    }

    return this.issueSession(user, metadata, now);
  }

  async refresh(refreshToken: string | undefined, now = new Date()): Promise<AuthResult> {
    if (!refreshToken) {
      throw invalidCredentials();
    }

    let claims;

    try {
      claims = this.tokens.verifyRefreshToken(refreshToken, now);
    } catch {
      throw invalidCredentials();
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
      throw invalidCredentials();
    }

    if (session.refreshTokenExpiresAt <= now || claims.expiresAt <= now) {
      await this.repository.revokeSession(session.id, "EXPIRED", now);
      throw invalidCredentials();
    }

    const nextRefreshToken = this.tokens.issueRefreshToken(user.id, session.id, now);
    const rotation = await this.repository.rotateRefreshToken({
      expectedRefreshTokenHash: this.tokens.hashRefreshToken(refreshToken),
      nextRefreshTokenHash: this.tokens.hashRefreshToken(nextRefreshToken.value),
      now,
      refreshTokenExpiresAt: nextRefreshToken.expiresAt,
      refreshTokenIssuedAt: now,
      sessionId: session.id,
    });

    if (rotation.outcome !== "ROTATED") {
      throw invalidCredentials();
    }

    const accessToken = this.tokens.issueAccessToken(user.id, session.id, now);
    return this.toAuthResult(user, accessToken, nextRefreshToken);
  }

  async logout(refreshToken: string | undefined, now = new Date()): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      const claims = this.tokens.verifyRefreshToken(refreshToken, now);
      const session = await this.repository.findSessionById(claims.sessionId);

      if (session?.userId === claims.subject && session.status === "ACTIVE") {
        await this.repository.revokeSession(session.id, "LOGOUT", now);
      }
    } catch {
      // Logout is deliberately idempotent and never reflects token details.
    }
  }

  async logoutAll(userId: string, now = new Date()): Promise<number> {
    return this.repository.revokeAllUserSessions(userId, "LOGOUT_ALL", now);
  }

  async me(context: AuthContext): Promise<PublicAuthUser> {
    const [user, session] = await Promise.all([
      this.repository.findUserById(context.userId),
      this.repository.findSessionById(context.sessionId),
    ]);

    if (
      !user ||
      !session ||
      session.userId !== user.id ||
      session.status !== "ACTIVE" ||
      user.status !== "ACTIVE"
    ) {
      throw invalidCredentials();
    }

    return safeUser(user);
  }

  private async issueSession(
    user: AuthUserRecord,
    metadata: AuthSessionMetadata,
    now: Date,
  ): Promise<AuthResult> {
    const sessionId = createAuthId(now.getTime());
    const refreshToken = this.tokens.issueRefreshToken(user.id, sessionId, now);
    const accessToken = this.tokens.issueAccessToken(user.id, sessionId, now);

    await this.repository.createSession(
      this.createSessionInput(
        user.id,
        sessionId,
        refreshToken.value,
        refreshToken.expiresAt,
        metadata,
        now,
      ),
    );

    return this.toAuthResult(user, accessToken, refreshToken);
  }

  private createSessionInput(
    userId: string,
    sessionId: string,
    refreshToken: string,
    refreshTokenExpiresAt: Date,
    metadata: AuthSessionMetadata,
    now: Date,
  ): CreateSessionInput {
    const userAgent = metadata.userAgent?.trim().slice(0, MAX_USER_AGENT_LENGTH);
    const ipAddress = metadata.ipAddress?.trim();

    return {
      id: sessionId,
      refreshTokenExpiresAt,
      refreshTokenHash: this.tokens.hashRefreshToken(refreshToken),
      refreshTokenIssuedAt: now,
      userId,
      ...(ipAddress ? { ipHash: this.tokens.hashIpAddress(ipAddress) } : {}),
      ...(userAgent ? { userAgent } : {}),
    };
  }

  private toAuthResult(
    user: AuthUserRecord,
    accessToken: { readonly value: string; readonly expiresAt: Date },
    refreshToken: { readonly value: string },
  ): AuthResult {
    return {
      accessToken: accessToken.value,
      accessTokenExpiresAt: accessToken.expiresAt.toISOString(),
      refreshToken: refreshToken.value,
      user: safeUser(user),
    };
  }
}
