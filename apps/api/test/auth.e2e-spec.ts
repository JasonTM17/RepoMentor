import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.js";
import { AuthTokenService } from "../src/modules/auth/auth-token.service.js";
import { AUTH_REPOSITORY } from "../src/modules/auth/auth.types.js";
import { InMemoryAuthRepository } from "../src/modules/auth/in-memory-auth.repository.js";

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

  before(async () => {
    const repository = new InMemoryAuthRepository();
    const tokenService = new AuthTokenService(tokenConfig);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_REPOSITORY)
      .useValue(repository)
      .overrideProvider(AuthTokenService)
      .useValue(tokenService)
      .compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  after(async () => {
    await app.close();
  });

  it("registers a user without returning password or refresh-token material", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("user-agent", "auth-test-agent")
      .send({
        displayName: "Ada Lovelace",
        email: "Ada@Example.com",
        password: "correct horse battery staple",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.user.email, "ada@example.com");
    assert.equal(response.body.data.user.displayName, "Ada Lovelace");
    assert.equal("passwordHash" in response.body.data.user, false);
    assert.equal("refreshToken" in response.body.data, false);

    const cookie = cookieHeader(response);
    assert.match(cookie, /^repomentor_refresh_token=/u);
    assert.match(response.headers["set-cookie"]?.[0] ?? "", /HttpOnly/u);
    assert.match(response.headers["set-cookie"]?.[0] ?? "", /Path=\/api\/v1\/auth/u);
    assert.match(response.headers["set-cookie"]?.[0] ?? "", /SameSite=Lax/u);
    assert.match(response.headers["set-cookie"]?.[0] ?? "", /Secure/u);
  });

  it("keeps duplicate registration and bad login errors generic", async () => {
    const duplicate = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      displayName: "Other Name",
      email: "ADA@example.com",
      password: "another correct password",
    });
    const wrongPassword = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "ada@example.com", password: "wrong password" });

    assert.equal(duplicate.status, 409);
    assert.equal(wrongPassword.status, 401);
    assert.equal(duplicate.body.error.code, "CONFLICT");
    assert.equal(wrongPassword.body.error.code, "UNAUTHORIZED");
    assert.equal(JSON.stringify(duplicate.body).includes("ADA@example.com"), false);
    assert.equal(JSON.stringify(wrongPassword.body).includes("ada@example.com"), false);
    assert.equal(JSON.stringify(wrongPassword.body).includes("wrong password"), false);
  });

  it("rotates refresh cookies and rejects replay", async () => {
    const registration = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      displayName: "Refresh User",
      email: "refresh@example.com",
      password: "correct horse battery staple",
    });
    const firstCookie = cookieHeader(registration);
    const refreshed = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("cookie", firstCookie);
    const replay = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("cookie", firstCookie);

    assert.equal(refreshed.status, 201);
    assert.notEqual(cookieHeader(refreshed), firstCookie);
    assert.equal(replay.status, 401);
    assert.match(replay.headers["set-cookie"]?.[0] ?? "", /Expires=Thu, 01 Jan 1970/u);
    assert.equal(JSON.stringify(replay.body).includes(firstCookie), false);
  });

  it("protects me and revokes every session on logout-all", async () => {
    const registration = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      displayName: "Session User",
      email: "sessions@example.com",
      password: "correct horse battery staple",
    });
    const secondLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "sessions@example.com", password: "correct horse battery staple" });
    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("authorization", `Bearer ${registration.body.data.accessToken}`);
    const logoutAll = await request(app.getHttpServer())
      .post("/api/v1/auth/logout-all")
      .set("authorization", `Bearer ${registration.body.data.accessToken}`);
    const revokedMe = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("authorization", `Bearer ${registration.body.data.accessToken}`);
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
});
