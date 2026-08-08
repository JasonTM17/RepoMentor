import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { API_PROBLEM_CODES } from "@repomentor/contracts";
import request from "supertest";

import { AppModule } from "../src/app.module.js";
import { CONTENT_SECURITY_POLICY, configureApp, type AppConfigurationOptions } from "../src/app.js";
import { QUOTA_ADMISSION_FINGERPRINT_CONFIG } from "../src/modules/usage/quota-admission.config.js";

// Test-only fixture; this is not a user or provider API key.
const TEST_QUOTA_ADMISSION_FINGERPRINT_SECRET =
  "test-only-quota-admission-fingerprint-fixture-32-bytes";
const ALLOWED_ORIGIN = "https://web.example.com";
const CORS_REQUEST_ID = "security-cors-123";

async function createSecurityApp(options: AppConfigurationOptions): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(QUOTA_ADMISSION_FINGERPRINT_CONFIG)
    .useValue({ fingerprintSecret: TEST_QUOTA_ADMISSION_FINGERPRINT_SECRET })
    .compile();

  const app = configureApp(moduleRef.createNestApplication({ bodyParser: false }), options);
  await app.init();
  return app;
}

describe("API transport security", () => {
  let app: INestApplication;

  before(async () => {
    app = await createSecurityApp({
      corsOrigins: [ALLOWED_ORIGIN],
      enableSwagger: true,
      nodeEnv: "development",
    });
  });

  after(async () => {
    await app.close();
  });

  it("allows configured origins with credentials and preserves request IDs", async () => {
    const response = await request(app.getHttpServer())
      .get("/health/live")
      .set("Origin", ALLOWED_ORIGIN)
      .set("X-Request-Id", CORS_REQUEST_ID);

    assert.equal(response.status, 200);
    assert.equal(response.headers["access-control-allow-origin"], ALLOWED_ORIGIN);
    assert.equal(response.headers["access-control-allow-credentials"], "true");
    assert.equal(response.headers["access-control-expose-headers"], "X-Request-Id");
    assert.equal(response.headers.vary, "Origin");
    assert.equal(response.headers["x-request-id"], CORS_REQUEST_ID);
    assert.deepEqual(response.body, { data: { status: "ok" } });
  });

  it("denies an unlisted origin without reflecting it or leaking details", async () => {
    const deniedOrigin = "https://evil.example";
    const response = await request(app.getHttpServer())
      .get("/health/live")
      .set("Origin", deniedOrigin)
      .set("X-Request-Id", "security-cors-denied");

    assert.equal(response.status, 403);
    assert.equal(response.headers["access-control-allow-origin"], undefined);
    assert.deepEqual(response.body, {
      error: {
        code: API_PROBLEM_CODES.FORBIDDEN,
        message: "You are not allowed to perform this action.",
        requestId: "security-cors-denied",
      },
    });
    assert.equal(JSON.stringify(response.body).includes(deniedOrigin), false);
    assert.equal(
      JSON.stringify(response.body).includes(TEST_QUOTA_ADMISSION_FINGERPRINT_SECRET),
      false,
    );
  });

  it("handles an allowed preflight with an explicit method and header set", async () => {
    const response = await request(app.getHttpServer())
      .options("/api/v1/auth/login")
      .set("Origin", ALLOWED_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization, content-type, x-request-id")
      .set("X-Request-Id", "security-preflight-123");

    assert.equal(response.status, 204);
    assert.equal(response.headers["access-control-allow-origin"], ALLOWED_ORIGIN);
    assert.equal(response.headers["access-control-allow-credentials"], "true");
    assert.match(response.headers["access-control-allow-methods"] ?? "", /POST/u);
    assert.match(response.headers["access-control-allow-headers"] ?? "", /Authorization/u);
    assert.equal(response.headers["x-request-id"], "security-preflight-123");
    assert.equal(response.text, "");
  });

  it("uses CSP in development and enables HSTS only for production options", async () => {
    const developmentResponse = await request(app.getHttpServer()).get("/health/live");

    assert.equal(developmentResponse.headers["content-security-policy"], CONTENT_SECURITY_POLICY);
    assert.equal(developmentResponse.headers["strict-transport-security"], undefined);
    assert.equal(developmentResponse.headers["x-powered-by"], undefined);

    const productionApp = await createSecurityApp({
      corsOrigins: [ALLOWED_ORIGIN],
      enableSwagger: false,
      nodeEnv: "production",
    });

    try {
      const productionResponse = await request(productionApp.getHttpServer()).get("/health/live");

      assert.equal(productionResponse.status, 200);
      assert.equal(productionResponse.headers["content-security-policy"], CONTENT_SECURITY_POLICY);
      assert.equal(
        productionResponse.headers["strict-transport-security"],
        "max-age=31536000; includeSubDomains",
      );
      assert.equal(
        (await request(productionApp.getHttpServer()).get("/api/docs-json")).status,
        404,
      );
    } finally {
      await productionApp.close();
    }
  });

  it("rejects oversized JSON and URL-encoded bodies with safe envelopes", async () => {
    const jsonRequestId = "security-body-json-123";
    const jsonResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("X-Request-Id", jsonRequestId)
      .send({
        displayName: "json-body-limit-secret",
        email: "json-body-limit@example.com",
        password: "x".repeat(140_000),
      });

    assert.equal(jsonResponse.status, 413);
    assert.equal(jsonResponse.headers["x-request-id"], jsonRequestId);
    assert.deepEqual(jsonResponse.body, {
      error: {
        code: API_PROBLEM_CODES.BAD_REQUEST,
        message: "The request is invalid.",
        requestId: jsonRequestId,
      },
    });
    assert.equal(JSON.stringify(jsonResponse.body).includes("json-body-limit-secret"), false);
    assert.equal(jsonResponse.headers["content-security-policy"], CONTENT_SECURITY_POLICY);

    const formRequestId = "security-body-form-123";
    const formResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("X-Request-Id", formRequestId)
      .type("form")
      .send({
        displayName: "form-body-limit-secret",
        email: "form-body-limit@example.com",
        password: "x".repeat(140_000),
      });

    assert.equal(formResponse.status, 413);
    assert.equal(formResponse.headers["x-request-id"], formRequestId);
    assert.deepEqual(formResponse.body, {
      error: {
        code: API_PROBLEM_CODES.BAD_REQUEST,
        message: "The request is invalid.",
        requestId: formRequestId,
      },
    });
    assert.equal(JSON.stringify(formResponse.body).includes("form-body-limit-secret"), false);
  });
});
