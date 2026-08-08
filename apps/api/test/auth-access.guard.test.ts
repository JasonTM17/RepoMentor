import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ExecutionContext } from "@nestjs/common";

import {
  AuthAccessGuard,
  type AuthenticatedRequest,
} from "../src/modules/auth/auth-access.guard.js";
import { createAuthId } from "../src/modules/auth/auth-id.js";
import { InMemoryAuthRepository } from "../src/modules/auth/in-memory-auth.repository.js";
import { AuthTokenService } from "../src/modules/auth/auth-token.service.js";

const tokenConfig = {
  accessSecret: "access-secret-for-rbac-guard-tests-32-bytes",
  accessTtlSeconds: 900,
  cookieSameSite: "lax" as const,
  cookieSecure: true,
  refreshSecret: "refresh-secret-for-rbac-guard-tests-32-bytes",
  refreshTtlSeconds: 7_200,
};

function makeContext(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("AuthAccessGuard", () => {
  it("propagates the current persisted role and overwrites caller-controlled auth state", async () => {
    const repository = new InMemoryAuthRepository();
    const tokens = new AuthTokenService(tokenConfig);
    const userId = createAuthId(1_754_638_400_000);
    const sessionId = createAuthId(1_754_638_401_000);
    const now = new Date();
    const refreshToken = tokens.issueRefreshToken(userId, sessionId, now);

    await repository.createUser({
      displayName: "RBAC Admin",
      email: "rbac-admin@example.com",
      id: userId,
      passwordHash: "test-only-hash",
      role: "ADMIN",
      status: "ACTIVE",
    });
    await repository.createSession({
      id: sessionId,
      ipHash: "a".repeat(64),
      refreshTokenExpiresAt: refreshToken.expiresAt,
      refreshTokenHash: tokens.hashRefreshToken(refreshToken.value),
      refreshTokenIssuedAt: now,
      userId,
    });

    const accessToken = tokens.issueAccessToken(userId, sessionId, now).value;
    const request = {
      auth: { role: "USER", sessionId: "caller-session", userId: "caller-user" },
      header: (name: string) =>
        name.toLowerCase() === "authorization" ? `Bearer ${accessToken}` : undefined,
    } as unknown as AuthenticatedRequest;
    const guard = new AuthAccessGuard(repository, tokens);

    assert.equal(await guard.canActivate(makeContext(request)), true);
    assert.deepEqual(request.auth, { role: "ADMIN", sessionId, userId });
  });
});
