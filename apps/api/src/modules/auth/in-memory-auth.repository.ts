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

  async createUserWithSession(input: {
    readonly user: CreateUserInput;
    readonly session: CreateSessionInput;
  }): Promise<{ readonly user: AuthUserRecord; readonly session: AuthSessionRecord }> {
    if (
      this.users.has(input.user.id) ||
      [...this.users.values()].some((user) => user.email === input.user.email)
    ) {
      throw new AuthUserConflictError();
    }

    if (input.session.userId !== input.user.id || this.sessions.has(input.session.id)) {
      throw new AuthUserConflictError();
    }

    const user: AuthUserRecord = {
      createdAt: new Date(),
      displayName: input.user.displayName,
      email: input.user.email,
      id: input.user.id,
      passwordHash: input.user.passwordHash,
      role: input.user.role,
      status: input.user.status,
      updatedAt: new Date(),
    };
    const session: AuthSessionRecord = {
      createdAt: input.session.refreshTokenIssuedAt,
      id: input.session.id,
      ipHash: input.session.ipHash ?? null,
      lastUsedAt: null,
      refreshTokenExpiresAt: input.session.refreshTokenExpiresAt,
      refreshTokenHash: input.session.refreshTokenHash,
      refreshTokenIssuedAt: input.session.refreshTokenIssuedAt,
      revocationReason: null,
      revokedAt: null,
      status: "ACTIVE",
      updatedAt: input.session.refreshTokenIssuedAt,
      userAgent: input.session.userAgent ?? null,
      userId: input.session.userId,
    };

    this.users.set(user.id, user);
    this.sessions.set(session.id, session);

    return { session: copySession(session), user: copyUser(user) };
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
