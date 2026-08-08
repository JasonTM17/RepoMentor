import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  LivenessHealthPayload,
  MetricsHealthPayload,
  ReadinessHealthPayload,
} from "@repomentor/contracts";
import {
  API_PROBLEM_CODES,
  apiErrorEnvelopeSchema,
  metricsHealthPayloadSchema,
} from "@repomentor/contracts";
import request from "supertest";

import { AppModule } from "../src/app.module.js";
import { CONTENT_SECURITY_POLICY, configureApp } from "../src/app.js";
import { QUOTA_ADMISSION_FINGERPRINT_CONFIG } from "../src/modules/usage/quota-admission.config.js";

// Test-only fixture; this is not a user or provider API key.
const TEST_QUOTA_ADMISSION_FINGERPRINT_SECRET =
  "test-only-quota-admission-fingerprint-fixture-32-bytes";

const expectedLivenessPayload: LivenessHealthPayload = {
  status: "ok",
};

const expectedReadinessPayload: ReadinessHealthPayload = {
  scope: "application",
  status: "ok",
};

const UUID_REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SwaggerResponse {
  info?: {
    title?: string;
  };
}

describe("health bootstrap", () => {
  let app: INestApplication;

  before(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(QUOTA_ADMISSION_FINGERPRINT_CONFIG)
      .useValue({ fingerprintSecret: TEST_QUOTA_ADMISSION_FINGERPRINT_SECRET })
      .compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  after(async () => {
    await app.close();
  });

  it("returns a consistent liveness envelope", async () => {
    const response = await request(app.getHttpServer()).get("/health/live");

    assert.equal(response.status, 200);
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["x-frame-options"], "DENY");
    assert.equal(response.headers["referrer-policy"], "no-referrer");
    assert.equal(response.headers["content-security-policy"], CONTENT_SECURITY_POLICY);
    assert.equal(
      response.headers["permissions-policy"],
      "camera=(), geolocation=(), microphone=()",
    );
    assert.equal(response.headers["strict-transport-security"], undefined);
    assert.equal(response.headers["x-powered-by"], undefined);
    assert.deepEqual(response.body as ApiSuccessEnvelope<LivenessHealthPayload>, {
      data: expectedLivenessPayload,
    });
  });

  it("returns application-only readiness with dependency scope", async () => {
    const response = await request(app.getHttpServer()).get("/health/ready");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body as ApiSuccessEnvelope<ReadinessHealthPayload>, {
      data: expectedReadinessPayload,
    });
    assert.equal(JSON.stringify(response.body).includes("DATABASE_URL"), false);
    assert.equal(JSON.stringify(response.body).includes("REDIS_URL"), false);
    assert.equal(JSON.stringify(response.body).includes("OPENAI_API_KEY"), false);
  });

  it("returns aggregate metrics without sensitive or high-cardinality fields", async () => {
    const response = await request(app.getHttpServer()).get("/health/metrics");
    const payload = (response.body as ApiSuccessEnvelope<MetricsHealthPayload>).data;

    assert.equal(response.status, 200);
    assert.equal(metricsHealthPayloadSchema.safeParse(payload).success, true);
    assert.ok(Number.isInteger(payload.requests.total));
    assert.ok(Number.isInteger(payload.requests.inFlight));
    assert.ok(Number.isInteger(payload.requests.completed));
    assert.ok(payload.requests.total >= payload.requests.inFlight);
    assert.ok(payload.requests.completed >= 0);

    const serializedPayload = JSON.stringify(payload);
    for (const forbiddenValue of [
      "source",
      "result",
      "provider",
      "model",
      "authorization",
      "DATABASE_URL",
      "REDIS_URL",
      "OPENAI_API_KEY",
    ]) {
      assert.equal(serializedPayload.includes(forbiddenValue), false);
    }
  });

  it("serves the configured Swagger document", async () => {
    const response = await request(app.getHttpServer()).get("/api/docs-json");
    const document = response.body as SwaggerResponse;

    assert.equal(response.status, 200);
    assert.equal(document.info?.title, "RepoMentor API");
  });

  it("does not expose Swagger when production configuration disables it", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(QUOTA_ADMISSION_FINGERPRINT_CONFIG)
      .useValue({ fingerprintSecret: TEST_QUOTA_ADMISSION_FINGERPRINT_SECRET })
      .compile();
    const productionApp = configureApp(moduleRef.createNestApplication(), {
      enableSwagger: false,
    });

    await productionApp.init();
    const response = await request(productionApp.getHttpServer()).get("/api/docs-json");

    assert.equal(response.status, 404);
    await productionApp.close();
  });

  it("returns a safe error envelope for an unknown API route", async () => {
    const requestId = "bootstrap-test-123";
    const response = await request(app.getHttpServer())
      .get("/api/v1/does-not-exist")
      .set("x-request-id", requestId);

    assert.equal(response.status, 404);
    assert.equal(response.headers["x-request-id"], requestId);
    assert.deepEqual(response.body as ApiErrorEnvelope, {
      error: {
        code: API_PROBLEM_CODES.NOT_FOUND,
        message: "The requested resource was not found.",
        requestId,
      },
    });
    assert.equal(apiErrorEnvelopeSchema.safeParse(response.body).success, true);
    assert.equal(JSON.stringify(response.body).includes("does-not-exist"), false);
    assert.equal(JSON.stringify(response.body).includes("stack"), false);
  });

  it("replaces an invalid request id with a bounded UUID", async () => {
    const invalidRequestId = "request id with spaces";
    const response = await request(app.getHttpServer())
      .get("/api/v1/does-not-exist")
      .set("x-request-id", invalidRequestId);
    const responseRequestId = response.headers["x-request-id"] as string;

    assert.equal(response.status, 404);
    assert.notEqual(responseRequestId, invalidRequestId);
    assert.match(responseRequestId, UUID_REQUEST_ID_PATTERN);
    assert.equal((response.body as ApiErrorEnvelope).error.requestId, responseRequestId);
  });
});
