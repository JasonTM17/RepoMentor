import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { UnauthorizedException } from "@nestjs/common";

import {
  AUTH_TOKEN_AUDIENCE,
  AUTH_TOKEN_ISSUER,
  AUTH_IDENTIFIER_PATTERN,
  AuthTokenConfigError,
  AuthTokenService,
  REFRESH_COOKIE_PATH,
  isAuthIdentifier,
  parseAuthTokenConfig,
} from "../src/modules/auth/auth-token.service.js";

const config = {
  accessSecret: "access-secret-for-tests-with-more-than-32-bytes",
  accessTtlSeconds: 900,
  cookieSameSite: "lax" as const,
  cookieSecure: true,
  refreshSecret: "refresh-secret-for-tests-with-more-than-32-bytes",
  refreshTtlSeconds: 7_200,
};

const userId = "c123456789012345678901234";
const sessionId = "c234567890123456789012345";
const issuedAt = new Date("2026-08-05T12:00:00.000Z");

describe("authentication token primitives", () => {
  const tokens = new AuthTokenService(config);

  it("issues and verifies typed access and refresh tokens", () => {
    const accessToken = tokens.issueAccessToken(userId, sessionId, issuedAt);
    const refreshToken = tokens.issueRefreshToken(userId, sessionId, issuedAt);

    assert.equal(tokens.verifyAccessToken(accessToken.value, issuedAt).subject, userId);
    assert.equal(tokens.verifyRefreshToken(refreshToken.value, issuedAt).sessionId, sessionId);
    assert.throws(
      () => tokens.verifyAccessToken(refreshToken.value, issuedAt),
      UnauthorizedException,
    );
  });

  it("rejects tampering, expiry, and malformed claims without exposing token details", () => {
    const token = tokens.issueAccessToken(userId, sessionId, issuedAt).value;
    const tamperedToken = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    assert.throws(() => tokens.verifyAccessToken(tamperedToken, issuedAt), UnauthorizedException);
    assert.throws(
      () => tokens.verifyAccessToken(token, new Date("2026-08-05T12:16:00.000Z")),
      UnauthorizedException,
    );
    assert.throws(
      () => tokens.verifyAccessToken("not.a.token", issuedAt), (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.equal(error.message, "Unauthorized");
        assert.equal(error.message.includes("not.a.token"), false);
        return true;
      },
    );
  });

  it("hashes refresh tokens and returns hardened cookie policy", () => {
    const refreshToken = tokens.issueRefreshToken(userId, sessionId, issuedAt).value;
    const refreshTokenHash = tokens.hashRefreshToken(refreshToken);
    const cookieOptions = tokens.getRefreshCookieOptions();

    assert.match(refreshTokenHash, /^[0-9a-f]{64}$/);
    assert.equal(refreshTokenHash.includes(refreshToken), false);
    assert.deepEqual(cookieOptions, {
      httpOnly: true,
      maxAge: 7_200_000,
      path: REFRESH_COOKIE_PATH,
      sameSite: "lax",
      secure: true,
    });
  });

  it("requires distinct high-entropy secrets and validates cookie settings", () => {
    assert.deepEqual(
      parseAuthTokenConfig({
        COOKIE_SECURE: "true",
        COOKIE_SAME_SITE: "strict",
        JWT_ACCESS_SECRET: config.accessSecret,
        JWT_REFRESH_SECRET: config.refreshSecret,
        NODE_ENV: "test",
      }),
      {
        accessSecret: config.accessSecret,
        accessTtlSeconds: 900,
        cookieSameSite: "strict",
        cookieSecure: true,
        refreshSecret: config.refreshSecret,
        refreshTtlSeconds: 2_592_000,
      },
    );
    assert.throws(
      () =>
        parseAuthTokenConfig({
          JWT_ACCESS_SECRET: "short",
          JWT_REFRESH_SECRET: "short",
        }),
      AuthTokenConfigError,
    );
    assert.throws(
      () =>
        parseAuthTokenConfig({
          COOKIE_SAME_SITE: "none",
          JWT_ACCESS_SECRET: config.accessSecret,
          JWT_REFRESH_SECRET: config.refreshSecret,
        }),
      AuthTokenConfigError,
    );
  });

  it("keeps the public token metadata names stable", () => {
    assert.equal(AUTH_IDENTIFIER_PATTERN.test(userId), true);
    assert.equal(isAuthIdentifier(sessionId), true);
    assert.equal(isAuthIdentifier("11111111-1111-4111-8111-111111111111"), false);
    assert.equal(AUTH_TOKEN_ISSUER, "repomentor-api");
    assert.equal(AUTH_TOKEN_AUDIENCE, "repomentor-web");
  });
});
