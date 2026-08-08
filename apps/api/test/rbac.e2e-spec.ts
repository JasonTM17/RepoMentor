import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { metricsHealthPayloadSchema } from "@repomentor/contracts";
import request from "supertest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.js";
import { createAuthId } from "../src/modules/auth/auth-id.js";
import { AUTH_REPOSITORY } from "../src/modules/auth/auth.types.js";
import { InMemoryAuthRepository } from "../src/modules/auth/in-memory-auth.repository.js";
import { AuthTokenService } from "../src/modules/auth/auth-token.service.js";
import { QUOTA_ADMISSION_FINGERPRINT_CONFIG } from "../src/modules/usage/quota-admission.config.js";

const TEST_QUOTA_ADMISSION_FINGERPRINT_SECRET =
  "test-only-quota-admission-fingerprint-fixture-32-bytes";

const tokenConfig = {
  accessSecret: "access-secret-for-rbac-http-tests-32-bytes",
  accessTtlSeconds: 900,
  cookieSameSite: "lax" as const,
  cookieSecure: true,
  refreshSecret: "refresh-secret-for-rbac-http-tests-32-bytes",
  refreshTtlSeconds: 7_200,
};

async function seedAccessToken(
  repository: InMemoryAuthRepository,
  tokens: AuthTokenService,
  role: "USER" | "ADMIN",
  sequence: number,
): Promise<string> {
  const userId = createAuthId(1_754_638_400_000 + sequence);
  const sessionId = createAuthId(1_754_638_500_000 + sequence);
  const now = new Date();
  const refreshToken = tokens.issueRefreshToken(userId, sessionId, now);

  await repository.createUser({
    displayName: `${role} RBAC user`,
    email: `${role.toLowerCase()}-${sequence}@example.com`,
    id: userId,
    passwordHash: "test-only-hash",
    role,
    status: "ACTIVE",
  });
  await repository.createSession({
    id: sessionId,
    refreshTokenExpiresAt: refreshToken.expiresAt,
    refreshTokenHash: tokens.hashRefreshToken(refreshToken.value),
    refreshTokenIssuedAt: now,
    userId,
  });

  return tokens.issueAccessToken(userId, sessionId, now).value;
}

describe("health metrics RBAC", () => {
  let app: INestApplication;
  let userToken: string;
  let adminToken: string;

  before(async () => {
    const repository = new InMemoryAuthRepository();
    const tokens = new AuthTokenService(tokenConfig);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(QUOTA_ADMISSION_FINGERPRINT_CONFIG)
      .useValue({ fingerprintSecret: TEST_QUOTA_ADMISSION_FINGERPRINT_SECRET })
      .overrideProvider(AUTH_REPOSITORY)
      .useValue(repository)
      .overrideProvider(AuthTokenService)
      .useValue(tokens)
      .compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();

    userToken = await seedAccessToken(repository, tokens, "USER", 1);
    adminToken = await seedAccessToken(repository, tokens, "ADMIN", 2);
  });

  after(async () => {
    await app.close();
  });

  it("keeps live and ready public while enforcing USER/ADMIN metrics access", async () => {
    const live = await request(app.getHttpServer()).get("/health/live");
    const ready = await request(app.getHttpServer()).get("/health/ready");
    const anonymous = await request(app.getHttpServer()).get("/health/metrics");
    const user = await request(app.getHttpServer())
      .get("/health/metrics")
      .set("authorization", `Bearer ${userToken}`);
    const admin = await request(app.getHttpServer())
      .get("/health/metrics")
      .set("authorization", `Bearer ${adminToken}`);

    assert.equal(live.status, 200);
    assert.equal(ready.status, 200);
    assert.equal(anonymous.status, 401);
    assert.equal(user.status, 403);
    assert.equal(admin.status, 200);
    assert.equal(metricsHealthPayloadSchema.safeParse(admin.body.data).success, true);
  });
});
