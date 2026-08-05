import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.js";
import type { ApiResponse } from "../src/common/http/api-response.js";
import type { HealthPayload } from "../src/modules/health/health.service.js";

const expectedHealthPayload: HealthPayload = {
  checks: { application: "up" },
  service: "api",
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
    assert.deepEqual(response.body as ApiResponse<HealthPayload>, { data: expectedHealthPayload });
  });

  it("returns application-only readiness with dependency scope", async () => {
    const response = await request(app.getHttpServer()).get("/health/ready");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body as ApiResponse<HealthPayload>, { data: expectedHealthPayload });
    assert.equal(JSON.stringify(response.body).includes("DATABASE_URL"), false);
    assert.equal(JSON.stringify(response.body).includes("REDIS_URL"), false);
  });

  it("serves the configured Swagger document", async () => {
    const response = await request(app.getHttpServer()).get("/api/docs-json");
    const document = response.body as SwaggerResponse;

    assert.equal(response.status, 200);
    assert.equal(document.info?.title, "RepoMentor API");
  });
});
