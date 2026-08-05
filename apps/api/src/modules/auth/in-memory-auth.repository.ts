import { AuthUserConflictError } from "./auth.types.js";
import type {
  AuthRepository,
  AuthSessionRecord,
  AuthUserRecord,
  CreateSessionInput,
  CreateUserInput,
  RefreshRotationResult,
  RotateRefreshTokenInput,
  AuthSessionRevocationReason,
} from "./auth.types.js";

function copyUser(user: AuthUserRecord): AuthUserRecord {
  return { ...user };
}

function copySession(session: AuthSessionRecord): AuthSessionRecord {
  return { ...session };
}

function revokeSessionRecord(
  session: AuthSessionRecord,
  reason: AuthSessionRevocationReason,
  now: Date,
): AuthSessionRecord {
  return {
    ...session,
    revokedAt: now,
    revocationReason: reason,
    status: "REVOKED",
    updatedAt: now,
  };
}

export class InMemoryAuthRepository implements AuthRepository {
  private readonly sessions = new Map<string, AuthSessionRecord>();
  private readonly users = new Map<string, AuthUserRecord>();

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const user = [...this.users.values()].find((candidate) => candidate.email === email);
    return user ? copyUser(user) : null;
  }

  async findUserById(id: string): Promise<AuthUserRecord | null> {
    const user = this.users.get(id);
    return user ? copyUser(user) : null;
  }

  async createUser(input: CreateUserInput): Promise<AuthUserRecord> {
    if (
      this.users.has(input.id) ||
      [...this.users.values()].some((user) => user.email === input.email)
    ) {
      throw new AuthUserConflictError();
    }

    const now = new Date();
    const user: AuthUserRecord = {
      createdAt: now,
      displayName: input.displayName,
      email: input.email,
      id: input.id,
      passwordHash: input.passwordHash,
      role: input.role,
      status: input.status,
      updatedAt: now,
    };

    this.users.set(user.id, user);
    return copyUser(user);
  }

  async createSession(input: CreateSessionInput): Promise<AuthSessionRecord> {
    if (this.sessions.has(input.id)) {
      throw new AuthUserConflictError();
    }

    const session: AuthSessionRecord = {
      createdAt: input.refreshTokenIssuedAt,
      id: input.id,
      ipHash: input.ipHash ?? null,
      lastUsedAt: null,
      refreshTokenExpiresAt: input.refreshTokenExpiresAt,
      refreshTokenHash: input.refreshTokenHash,
      refreshTokenIssuedAt: input.refreshTokenIssuedAt,
      revocationReason: null,
      revokedAt: null,
      status: "ACTIVE",
      updatedAt: input.refreshTokenIssuedAt,
      userAgent: input.userAgent ?? null,
      userId: input.userId,
    };

    this.sessions.set(session.id, session);
    return copySession(session);
  }

  async findSessionById(id: string): Promise<AuthSessionRecord | null> {
    const session = this.sessions.get(id);
    return session ? copySession(session) : null;
  }

  async rotateRefreshToken(input: RotateRefreshTokenInput): Promise<RefreshRotationResult> {
    const session = this.sessions.get(input.sessionId);

    if (!session || session.status !== "ACTIVE") {
      return { outcome: "NOT_ACTIVE" };
    }

    if (session.refreshTokenHash !== input.expectedRefreshTokenHash) {
      this.sessions.set(session.id, revokeSessionRecord(session, "REFRESH_REUSE", input.now));
      return { outcome: "REUSE_DETECTED" };
    }

    const rotated: AuthSessionRecord = {
      ...session,
      lastUsedAt: input.now,
      refreshTokenExpiresAt: input.refreshTokenExpiresAt,
      refreshTokenHash: input.nextRefreshTokenHash,
      refreshTokenIssuedAt: input.refreshTokenIssuedAt,
      updatedAt: input.now,
    };
    this.sessions.set(rotated.id, rotated);
    return { outcome: "ROTATED", session: copySession(rotated) };
  }

  async revokeSession(id: string, reason: AuthSessionRevocationReason, now: Date): Promise<void> {
    const session = this.sessions.get(id);

    if (session?.status === "ACTIVE") {
      this.sessions.set(id, revokeSessionRecord(session, reason, now));
    }
  }

  async revokeAllUserSessions(
    userId: string,
    reason: AuthSessionRevocationReason,
    now: Date,
  ): Promise<number> {
    let count = 0;

    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.status === "ACTIVE") {
        this.sessions.set(session.id, revokeSessionRecord(session, reason, now));
        count += 1;
      }
    }

    return count;
  }
}
