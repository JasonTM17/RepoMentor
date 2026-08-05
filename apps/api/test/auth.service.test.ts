import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { UnauthorizedException } from "@nestjs/common";

import { AuthService } from "../src/modules/auth/auth.service.js";
import { AuthTokenService } from "../src/modules/auth/auth-token.service.js";
import { InMemoryAuthRepository } from "../src/modules/auth/in-memory-auth.repository.js";
import type { PasswordHasherService } from "../src/modules/auth/password-hasher.service.js";

const tokenConfig = {
  accessSecret: "access-secret-for-auth-service-tests-32-bytes",
  accessTtlSeconds: 900,
  cookieSameSite: "lax" as const,
  cookieSecure: true,
  refreshSecret: "refresh-secret-for-auth-service-tests-32-bytes",
  refreshTtlSeconds: 7_200,
};

const now = new Date("2026-08-05T12:00:00.000Z");
const passwordHasher = {
  hashPassword: async (password: string) => `hash:${password}`,
  verifyPassword: async (password: string, passwordHash?: string) =>
    passwordHash === `hash:${password}`,
} as unknown as PasswordHasherService;

function createFixture() {
  const repository = new InMemoryAuthRepository();
  const tokens = new AuthTokenService(tokenConfig);
  const service = new AuthService(repository, passwordHasher, tokens);

  return { repository, service, tokens };
}

describe("authentication service", () => {
  it("normalizes registration and stores only a hashed refresh token", async () => {
    const { repository, service, tokens } = createFixture();
    const result = await service.register(
      "  Ada@Example.COM ",
      "  Ada Lovelace  ",
      "correct horse battery staple",
      { ipAddress: "192.0.2.10", userAgent: "test-agent" },
      now,
    );
    const claims = tokens.verifyRefreshToken(result.refreshToken, now);
    const session = await repository.findSessionById(claims.sessionId);

    assert.equal(result.user.email, "ada@example.com");
    assert.equal(result.user.displayName, "Ada Lovelace");
    assert.equal("passwordHash" in result.user, false);
    assert.ok(session);
    assert.notEqual(session.refreshTokenHash, result.refreshToken);
    assert.match(session.ipHash ?? "", /^[0-9a-f]{64}$/);
    assert.equal(session.userAgent, "test-agent");
  });

  it("uses one generic credential failure for unknown and wrong passwords", async () => {
    const { service } = createFixture();

    await assert.rejects(
      service.login("missing@example.com", "wrong password", {}, now),
      UnauthorizedException,
    );
    await service.register(
      "known@example.com",
      "Known User",
      "correct horse battery staple",
      {},
      now,
    );
    await assert.rejects(
      service.login("known@example.com", "wrong password", {}, now),
      UnauthorizedException,
    );
  });

  it("rotates refresh tokens and revokes a session on replay", async () => {
    const { repository, service, tokens } = createFixture();
    const registered = await service.register(
      "rotate@example.com",
      "Rotate User",
      "correct horse battery staple",
      {},
      now,
    );
    const rotated = await service.refresh(
      registered.refreshToken,
      new Date("2026-08-05T12:00:01.000Z"),
    );

    assert.notEqual(rotated.refreshToken, registered.refreshToken);
    await assert.rejects(
      service.refresh(registered.refreshToken, new Date("2026-08-05T12:00:02.000Z")),
      UnauthorizedException,
    );

    const sessionId = tokens.verifyRefreshToken(rotated.refreshToken, now).sessionId;
    const session = await repository.findSessionById(sessionId);
    assert.equal(session?.status, "REVOKED");
    assert.equal(session?.revocationReason, "REFRESH_REUSE");
  });

  it("revokes every session for logout-all", async () => {
    const { repository, service, tokens } = createFixture();
    const registered = await service.register(
      "logout@example.com",
      "Logout User",
      "correct horse battery staple",
      {},
      now,
    );
    const secondLogin = await service.login(
      "logout@example.com",
      "correct horse battery staple",
      {},
      now,
    );
    const userId = tokens.verifyAccessToken(registered.accessToken, now).subject;

    assert.equal(await service.logoutAll(userId, now), 2);
    assert.equal(
      (
        await repository.findSessionById(
          tokens.verifyRefreshToken(registered.refreshToken, now).sessionId,
        )
      )?.status,
      "REVOKED",
    );
    assert.equal(
      (
        await repository.findSessionById(
          tokens.verifyRefreshToken(secondLogin.refreshToken, now).sessionId,
        )
      )?.status,
      "REVOKED",
    );
  });
});
