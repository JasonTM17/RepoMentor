import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type {
  ApiSuccessEnvelope,
  LivenessHealthPayload,
  ReadinessHealthPayload,
} from "@repomentor/contracts";
import request from "supertest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.js";

const expectedLivenessPayload: LivenessHealthPayload = {
  status: "ok",
};

const expectedReadinessPayload: ReadinessHealthPayload = {
  scope: "application",
  status: "ok",
};

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
    }).compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  after(async () => {
    await app.close();
  });

  it("returns a consistent liveness envelope", async () => {
    const response = await request(app.getHttpServer()).get("/health/live");

    assert.equal(response.status, 200);
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

  it("serves the configured Swagger document", async () => {
    const response = await request(app.getHttpServer()).get("/api/docs-json");
    const document = response.body as SwaggerResponse;

    assert.equal(response.status, 200);
    assert.equal(document.info?.title, "RepoMentor API");
  });
});
