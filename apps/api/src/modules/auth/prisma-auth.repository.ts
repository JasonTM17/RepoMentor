import { Injectable } from "@nestjs/common";

import { PrismaService } from "./prisma.service.js";
import { AuthUserConflictError } from "./auth.types.js";
import type {
  AuthRepository,
  AuthSessionRecord,
  AuthUserRecord,
  ChangePasswordInput,
  CreateSessionInput,
  CreateUserInput,
  RefreshRotationResult,
  RotateRefreshTokenInput,
  AuthSessionRevocationReason,
  AuthSessionStatus,
  AuthUserRole,
  AuthUserStatus,
} from "./auth.types.js";

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface SessionRow {
  id: string;
  userId: string;
  refreshTokenHash: string;
  refreshTokenIssuedAt: Date;
  refreshTokenExpiresAt: Date;
  lastUsedAt: Date | null;
  userAgent: string | null;
  ipHash: string | null;
  status: string;
  revokedAt: Date | null;
  revocationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapUser(row: UserRow): AuthUserRecord {
  return {
    createdAt: row.createdAt,
    displayName: row.displayName,
    email: row.email,
    id: row.id,
    passwordHash: row.passwordHash,
    role: row.role as AuthUserRole,
    status: row.status as AuthUserStatus,
    updatedAt: row.updatedAt,
  };
}

function mapSession(row: SessionRow): AuthSessionRecord {
  return {
    createdAt: row.createdAt,
    id: row.id,
    ipHash: row.ipHash,
    lastUsedAt: row.lastUsedAt,
    refreshTokenExpiresAt: row.refreshTokenExpiresAt,
    refreshTokenHash: row.refreshTokenHash,
    refreshTokenIssuedAt: row.refreshTokenIssuedAt,
    revocationReason: row.revocationReason as AuthSessionRecord["revocationReason"],
    revokedAt: row.revokedAt,
    status: row.status as AuthSessionStatus,
    updatedAt: row.updatedAt,
    userAgent: row.userAgent,
    userId: row.userId,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function createSessionData(input: CreateSessionInput) {
  return {
    id: input.id,
    refreshTokenExpiresAt: input.refreshTokenExpiresAt,
    refreshTokenHash: input.refreshTokenHash,
    refreshTokenIssuedAt: input.refreshTokenIssuedAt,
    userId: input.userId,
    ...(input.ipHash === undefined ? {} : { ipHash: input.ipHash }),
    ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
  };
}

@Injectable()
export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? mapUser(user) : null;
  }

  async findUserById(id: string): Promise<AuthUserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? mapUser(user) : null;
  }

  async createUser(input: CreateUserInput): Promise<AuthUserRecord> {
    try {
      const user = await this.prisma.user.create({
        data: {
          displayName: input.displayName,
          email: input.email,
          id: input.id,
          passwordHash: input.passwordHash,
          role: input.role,
          status: input.status,
        },
      });

      return mapUser(user);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new AuthUserConflictError();
      }

      throw error;
    }
  }

  async changePassword(input: ChangePasswordInput): Promise<boolean> {
    return this.prisma.transaction(async (client) => {
      const updated = await client.user.updateMany({
        data: {
          passwordHash: input.nextPasswordHash,
          updatedAt: input.now,
        },
        where: {
          id: input.userId,
          passwordHash: input.expectedPasswordHash,
          status: "ACTIVE",
        },
      });

      if (updated.count !== 1) {
        return false;
      }

      await client.session.updateMany({
        data: {
          revokedAt: input.now,
          revocationReason: "LOGOUT_ALL",
          status: "REVOKED",
        },
        where: { status: "ACTIVE", userId: input.userId },
      });

      return true;
    });
  }

  async createSession(input: CreateSessionInput): Promise<AuthSessionRecord> {
    const session = await this.prisma.session.create({
      data: createSessionData(input),
    });

    return mapSession(session);
  }

  async findSessionById(id: string): Promise<AuthSessionRecord | null> {
    const session = await this.prisma.session.findUnique({ where: { id } });
    return session ? mapSession(session) : null;
  }

  async rotateRefreshToken(input: RotateRefreshTokenInput): Promise<RefreshRotationResult> {
    const updated = await this.prisma.session.updateMany({
      data: {
        lastUsedAt: input.now,
        refreshTokenExpiresAt: input.refreshTokenExpiresAt,
        refreshTokenHash: input.nextRefreshTokenHash,
        refreshTokenIssuedAt: input.refreshTokenIssuedAt,
      },
      where: {
        id: input.sessionId,
        refreshTokenHash: input.expectedRefreshTokenHash,
        status: "ACTIVE",
      },
    });

    if (updated.count === 1) {
      const session = await this.findSessionById(input.sessionId);

      if (session) {
        return { outcome: "ROTATED", session };
      }
    }

    const current = await this.prisma.session.findUnique({
      select: { status: true },
      where: { id: input.sessionId },
    });

    if (current?.status === "ACTIVE") {
      await this.prisma.session.updateMany({
        data: {
          revokedAt: input.now,
          revocationReason: "REFRESH_REUSE",
          status: "REVOKED",
        },
        where: { id: input.sessionId, status: "ACTIVE" },
      });

      return { outcome: "REUSE_DETECTED" };
    }

    return { outcome: "NOT_ACTIVE" };
  }

  async revokeSession(id: string, reason: AuthSessionRevocationReason, now: Date): Promise<void> {
    await this.prisma.session.updateMany({
      data: { revokedAt: now, revocationReason: reason, status: "REVOKED" },
      where: { id, status: "ACTIVE" },
    });
  }

  async revokeAllUserSessions(
    userId: string,
    reason: AuthSessionRevocationReason,
    now: Date,
  ): Promise<number> {
    const result = await this.prisma.session.updateMany({
      data: { revokedAt: now, revocationReason: reason, status: "REVOKED" },
      where: { status: "ACTIVE", userId },
    });

    return result.count;
  }
}
