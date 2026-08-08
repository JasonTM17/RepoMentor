import type { Prisma } from "@prisma/client";

export const AUTH_REPOSITORY = Symbol("AUTH_REPOSITORY");

export const AUTH_USER_ROLES = ["USER", "ADMIN"] as const;
export type AuthUserRole = (typeof AUTH_USER_ROLES)[number];

export const AUTH_USER_STATUSES = ["ACTIVE", "DISABLED"] as const;
export type AuthUserStatus = (typeof AUTH_USER_STATUSES)[number];

export class AuthUserConflictError extends Error {
  constructor() {
    super("The user could not be created.");
    this.name = "AuthUserConflictError";
  }
}

export const AUTH_SESSION_STATUSES = ["ACTIVE", "REVOKED"] as const;
export type AuthSessionStatus = (typeof AUTH_SESSION_STATUSES)[number];

export const AUTH_SESSION_REVOCATION_REASONS = [
  "LOGOUT",
  "LOGOUT_ALL",
  "REFRESH_REUSE",
  "EXPIRED",
  "ADMIN",
] as const;
export type AuthSessionRevocationReason = (typeof AUTH_SESSION_REVOCATION_REASONS)[number];

export interface AuthUserRecord {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly role: AuthUserRole;
  readonly status: AuthUserStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AuthSessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly refreshTokenHash: string;
  readonly refreshTokenIssuedAt: Date;
  readonly refreshTokenExpiresAt: Date;
  readonly lastUsedAt: Date | null;
  readonly userAgent: string | null;
  readonly ipHash: string | null;
  readonly status: AuthSessionStatus;
  readonly revokedAt: Date | null;
  readonly revocationReason: AuthSessionRevocationReason | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateUserInput {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly role: AuthUserRole;
  readonly status: AuthUserStatus;
}

export interface ChangePasswordInput {
  readonly userId: string;
  readonly expectedPasswordHash: string;
  readonly nextPasswordHash: string;
  readonly now: Date;
}

export interface CreateSessionInput {
  readonly id: string;
  readonly userId: string;
  readonly refreshTokenHash: string;
  readonly refreshTokenIssuedAt: Date;
  readonly refreshTokenExpiresAt: Date;
  readonly userAgent?: string;
  readonly ipHash?: string;
}

export interface RotateRefreshTokenInput {
  readonly sessionId: string;
  readonly expectedRefreshTokenHash: string;
  readonly nextRefreshTokenHash: string;
  readonly refreshTokenIssuedAt: Date;
  readonly refreshTokenExpiresAt: Date;
  readonly now: Date;
}

export type RefreshRotationResult =
  | { readonly outcome: "ROTATED"; readonly session: AuthSessionRecord }
  | { readonly outcome: "REUSE_DETECTED" }
  | { readonly outcome: "NOT_ACTIVE" };

export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findUserById(id: string): Promise<AuthUserRecord | null>;
  createUser(input: CreateUserInput): Promise<AuthUserRecord>;
  changePassword(input: ChangePasswordInput): Promise<boolean>;
  createSession(input: CreateSessionInput): Promise<AuthSessionRecord>;
  findSessionById(id: string): Promise<AuthSessionRecord | null>;
  rotateRefreshToken(input: RotateRefreshTokenInput): Promise<RefreshRotationResult>;
  revokeSession(id: string, reason: AuthSessionRevocationReason, now: Date): Promise<void>;
  revokeAllUserSessions(
    userId: string,
    reason: AuthSessionRevocationReason,
    now: Date,
  ): Promise<number>;
}

export type PrismaAuthClient = Prisma.TransactionClient;

export interface AuthSessionMetadata {
  readonly userAgent?: string;
  readonly ipAddress?: string;
}

export interface AuthContext {
  readonly userId: string;
  readonly sessionId: string;
}
