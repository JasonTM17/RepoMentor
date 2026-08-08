import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.js";
import { AuthTokenService } from "../src/modules/auth/auth-token.service.js";
import { AuthRateLimiter } from "../src/modules/auth/auth-rate-limiter.js";
import { AUTH_REPOSITORY } from "../src/modules/auth/auth.types.js";
import { InMemoryAuthRepository } from "../src/modules/auth/in-memory-auth.repository.js";
import { QUOTA_ADMISSION_FINGERPRINT_CONFIG } from "../src/modules/usage/quota-admission.config.js";

// Test-only fixture; this is not a user or provider API key.
const TEST_QUOTA_ADMISSION_FINGERPRINT_SECRET =
  "test-only-quota-admission-fingerprint-fixture-32-bytes";

const tokenConfig = {
  accessSecret: "access-secret-for-controller-tests-32-bytes",
  accessTtlSeconds: 900,
  cookieSameSite: "lax" as const,
  cookieSecure: true,
  refreshSecret: "refresh-secret-for-controller-tests-32-bytes",
  refreshTtlSeconds: 7_200,
};

function cookieHeader(response: request.Response): string {
  const setCookie = response.headers["set-cookie"]?.[0];

  if (!setCookie) {
    throw new Error("Expected a refresh cookie.");
  }

  return setCookie.split(";", 1)[0] ?? "";
}

describe("authentication bootstrap", () => {
  let app: INestApplication;
  let rateLimiter: AuthRateLimiter;

  before(async () => {
    const repository = new InMemoryAuthRepository();
    const tokenService = new AuthTokenService(tokenConfig);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(QUOTA_ADMISSION_FINGERPRINT_CONFIG)
      .useValue({ fingerprintSecret: TEST_QUOTA_ADMISSION_FINGERPRINT_SECRET })
      .overrideProvider(AUTH_REPOSITORY)
      .useValue(repository)
      .overrideProvider(AuthTokenService)
      .useValue(tokenService)
      .compile();

    app = configureApp(moduleRef.createNestApplication());
    rateLimiter = moduleRef.get(AuthRateLimiter);
    await app.init();
  });

  after(async () => {
    await app.close();
  });

  beforeEach(() => {
    rateLimiter.clear();
  });

  it("accepts registration without returning authentication material", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("user-agent", "auth-test-agent")
      .send({
        displayName: "Ada Lovelace",
        email: "Ada@Example.com",
        password: "correct horse battery staple",
      });

    assert.equal(response.status, 202);
    assert.deepEqual(response.body, { data: { accepted: true } });
    assert.equal(response.headers["set-cookie"], undefined);
  });

  it("keeps new and duplicate registration indistinguishable", async () => {
    const first = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      displayName: "Enumeration User",
      email: "enumeration@example.com",
      password: "correct horse battery staple",
    });
    const duplicate = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      displayName: "Other Name",
      email: "ENUMERATION@example.com",
      password: "another correct password",
    });
    const wrongPassword = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "enumeration@example.com", password: "wrong password" });

    assert.equal(first.status, 202);
    assert.equal(duplicate.status, 202);
    assert.deepEqual(duplicate.body, first.body);
    assert.equal(duplicate.headers["set-cookie"], undefined);
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.body.error.code, "UNAUTHORIZED");
    assert.equal(JSON.stringify(duplicate.body).includes("enumeration@example.com"), false);
    assert.equal(JSON.stringify(wrongPassword.body).includes("enumeration@example.com"), false);
    assert.equal(JSON.stringify(wrongPassword.body).includes("wrong password"), false);
  });

  it("rotates refresh cookies and rejects replay", async () => {
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      displayName: "Refresh User",
      email: "refresh@example.com",
      password: "correct horse battery staple",
    });
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      email: "refresh@example.com",
      password: "correct horse battery staple",
    });
    const firstCookie = cookieHeader(login);
    const refreshed = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("cookie", firstCookie);
    const replay = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("cookie", firstCookie);

    assert.equal(login.status, 201);
    assert.deepEqual(Object.keys(login.body.data).sort(), [
      "accessToken",
      "expiresInSeconds",
      "tokenType",
      "user",
    ]);
    assert.equal(login.body.data.tokenType, "Bearer");
    assert.equal(login.body.data.expiresInSeconds, 900);
    assert.equal("accessTokenExpiresAt" in login.body.data, false);
    assert.equal(refreshed.status, 201);
    assert.notEqual(cookieHeader(refreshed), firstCookie);
    assert.equal(replay.status, 401);
    assert.match(replay.headers["set-cookie"]?.[0] ?? "", /Expires=Thu, 01 Jan 1970/u);
    assert.equal(JSON.stringify(replay.body).includes(firstCookie), false);
  });

  it("logs out one session, clears the cookie, and is idempotent", async () => {
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      displayName: "Single Logout User",
      email: "single-logout@example.com",
      password: "correct horse battery staple",
    });
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      email: "single-logout@example.com",
      password: "correct horse battery staple",
    });
    const refreshCookie = cookieHeader(login);
    const logout = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("cookie", refreshCookie);
    const revokedRefresh = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("cookie", refreshCookie);
    const revokedMe = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("authorization", `Bearer ${login.body.data.accessToken}`);
    const repeatedLogout = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("cookie", refreshCookie);
    const malformedLogout = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("cookie", "repomentor_refresh_token=malformed.token.value");

    assert.equal(logout.status, 201);
    assert.equal(logout.body.data.loggedOut, true);
    assert.match(logout.headers["set-cookie"]?.[0] ?? "", /Expires=Thu, 01 Jan 1970/u);
    assert.equal(revokedRefresh.status, 401);
    assert.equal(revokedMe.status, 401);
    assert.equal(repeatedLogout.status, 201);
    assert.equal(repeatedLogout.body.data.loggedOut, true);
    assert.equal(malformedLogout.status, 201);
    assert.equal(malformedLogout.body.data.loggedOut, true);
    assert.match(malformedLogout.headers["set-cookie"]?.[0] ?? "", /Expires=Thu, 01 Jan 1970/u);
  });

  it("protects me and revokes every session on logout-all", async () => {
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      displayName: "Session User",
      email: "sessions@example.com",
      password: "correct horse battery staple",
    });
    const firstLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "sessions@example.com", password: "correct horse battery staple" });
    const secondLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "sessions@example.com", password: "correct horse battery staple" });
    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("authorization", `Bearer ${firstLogin.body.data.accessToken}`);
    const logoutAll = await request(app.getHttpServer())
      .post("/api/v1/auth/logout-all")
      .set("authorization", `Bearer ${firstLogin.body.data.accessToken}`);
    const revokedMe = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("authorization", `Bearer ${firstLogin.body.data.accessToken}`);
    const revokedRefresh = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("cookie", cookieHeader(secondLogin));

    assert.equal(me.status, 200);
    assert.equal(me.body.data.email, "sessions@example.com");
    assert.equal("passwordHash" in me.body.data, false);
    assert.equal(logoutAll.status, 201);
    assert.equal(logoutAll.body.data.loggedOut, true);
    assert.equal(revokedMe.status, 401);
    assert.equal(revokedRefresh.status, 401);
  });

  it("changes the password, revokes every session, and requires re-authentication", async () => {
    const oldPassword = "correct horse battery staple";
    const newPassword = "new correct horse battery staple";
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      displayName: "Password Change User",
      email: "password-change@example.com",
      password: oldPassword,
    });
    const firstLogin = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      email: "password-change@example.com",
      password: oldPassword,
    });
    const secondLogin = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      email: "password-change@example.com",
      password: oldPassword,
    });
    const changed = await request(app.getHttpServer())
      .patch("/api/v1/auth/password")
      .set("authorization", `Bearer ${firstLogin.body.data.accessToken}`)
      .send({
        currentPassword: oldPassword,
        newPassword,
        newPasswordConfirmation: newPassword,
      });
    const revokedMe = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("authorization", `Bearer ${firstLogin.body.data.accessToken}`);
    const revokedRefresh = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("cookie", cookieHeader(secondLogin));
    const oldLogin = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      email: "password-change@example.com",
      password: oldPassword,
    });
    const newLogin = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      email: "password-change@example.com",
      password: newPassword,
    });

    assert.equal(changed.status, 200);
    assert.deepEqual(changed.body, { data: { passwordChanged: true } });
    assert.match(changed.headers["set-cookie"]?.[0] ?? "", /Expires=Thu, 01 Jan 1970/u);
    assert.equal(JSON.stringify(changed.body).includes(oldPassword), false);
    assert.equal(JSON.stringify(changed.body).includes(newPassword), false);
    assert.equal(revokedMe.status, 401);
    assert.equal(revokedRefresh.status, 401);
    assert.equal(oldLogin.status, 401);
    assert.equal(newLogin.status, 201);
  });

  it("maps password-change credential and confirmation failures without echoing secrets", async () => {
    const oldPassword = "password-change-current";
    const newPassword = "password-change-replacement";
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      displayName: "Password Failure User",
      email: "password-failure@example.com",
      password: oldPassword,
    });
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      email: "password-failure@example.com",
      password: oldPassword,
    });
    const wrongCurrent = await request(app.getHttpServer())
      .patch("/api/v1/auth/password")
      .set("authorization", `Bearer ${login.body.data.accessToken}`)
      .send({
        currentPassword: "wrong password",
        newPassword,
        newPasswordConfirmation: newPassword,
      });
    const mismatchedConfirmation = await request(app.getHttpServer())
      .patch("/api/v1/auth/password")
      .set("authorization", `Bearer ${login.body.data.accessToken}`)
      .send({
        currentPassword: oldPassword,
        newPassword,
        newPasswordConfirmation: "different replacement password",
      });
    const invalidBody = await request(app.getHttpServer())
      .patch("/api/v1/auth/password")
      .set("authorization", `Bearer ${login.body.data.accessToken}`)
      .send({
        currentPassword: oldPassword,
        newPassword: "short",
        newPasswordConfirmation: "short",
        passwordHash: "must not be accepted",
      });

    assert.equal(wrongCurrent.status, 401);
    assert.equal(wrongCurrent.body.error.code, "UNAUTHORIZED");
    assert.equal(mismatchedConfirmation.status, 400);
    assert.equal(mismatchedConfirmation.body.error.code, "BAD_REQUEST");
    assert.equal(invalidBody.status, 400);
    assert.equal(invalidBody.body.error.code, "VALIDATION_FAILED");
    for (const response of [wrongCurrent, mismatchedConfirmation, invalidBody]) {
      const serialized = JSON.stringify(response.body);
      assert.equal(serialized.includes(oldPassword), false);
      assert.equal(serialized.includes(newPassword), false);
      assert.equal(serialized.includes("must not be accepted"), false);
    }
  });

  it("documents the password-change route and strict DTO fields in Swagger", async () => {
    const response = await request(app.getHttpServer()).get("/api/docs-json");
    const operation = response.body.paths?.["/api/v1/auth/password"]?.patch;
    const requestSchema = operation?.requestBody?.content?.["application/json"]?.schema;
    const dtoSchema = response.body.components?.schemas?.ChangePasswordDto;

    assert.equal(response.status, 200);
    assert.ok(operation);
    assert.equal(requestSchema.$ref, "#/components/schemas/ChangePasswordDto");
    assert.deepEqual(Object.keys(dtoSchema.properties).sort(), [
      "currentPassword",
      "newPassword",
      "newPasswordConfirmation",
    ]);
    assert.deepEqual(dtoSchema.required.sort(), [
      "currentPassword",
      "newPassword",
      "newPasswordConfirmation",
    ]);
    assert.equal(operation.responses["200"].description.includes("All active sessions"), true);
    assert.match(JSON.stringify(operation.responses["401"]), /current password/u);
  });

  it("rate-limits login with a generic bounded response", async () => {
    rateLimiter.clear();
    let blocked: request.Response | undefined;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "rate-limit@example.com", password: "wrong password" });

      if (response.status === 429) {
        blocked = response;
        break;
      }
    }

    if (!blocked) {
      throw new Error("Expected login rate limiting to activate.");
    }

    assert.equal(blocked.body.error.code, "RATE_LIMITED");
    assert.equal(blocked.body.error.message, "Too many requests. Please try again later.");
    assert.match(blocked.headers["retry-after"] ?? "", /^\d+$/u);
    assert.equal(JSON.stringify(blocked.body).includes("rate-limit@example.com"), false);
  });
});
