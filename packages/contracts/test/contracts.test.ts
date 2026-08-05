import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  API_PROBLEM_CODES,
  apiErrorEnvelopeSchema,
  apiProblemSchema,
  apiSuccessEnvelopeSchema,
  createApiSuccessEnvelopeSchema,
  livenessHealthPayloadSchema,
  readinessHealthPayloadSchema,
} from "../src/index.js";

test("accepts a valid API problem and rejects unsafe fields", () => {
  const problem = {
    code: API_PROBLEM_CODES.VALIDATION_FAILED,
    message: "The request is invalid.",
    requestId: "request-123",
    details: {
      fieldErrors: {
        email: ["Enter a valid email address."],
      },
      retryAfterSeconds: 5,
    },
  };

  assert.equal(apiProblemSchema.safeParse(problem).success, true);

  for (const forbiddenField of ["stack", "secret", "token", "source"]) {
    const unsafeProblem = { ...problem, [forbiddenField]: "must not cross the boundary" };
    assert.equal(apiProblemSchema.safeParse(unsafeProblem).success, false);
  }

  assert.equal(
    apiProblemSchema.safeParse({
      ...problem,
      details: { source: "private source code" },
    }).success,
    false,
  );
});

test("accepts generic success and error envelopes", () => {
  const dataSchema = z.object({ id: z.string().min(1) });
  const successSchema = createApiSuccessEnvelopeSchema(dataSchema);

  assert.equal(
    successSchema.safeParse({ data: { id: "review-123" }, meta: { page: 1, total: 1 } }).success,
    true,
  );
  assert.equal(successSchema.safeParse({ data: { id: 42 } }).success, false);
  assert.equal(apiSuccessEnvelopeSchema.safeParse({ data: { accepted: true } }).success, true);
  assert.equal(
    apiErrorEnvelopeSchema.safeParse({
      error: {
        code: API_PROBLEM_CODES.NOT_FOUND,
        message: "Review not found.",
        requestId: "request-456",
      },
    }).success,
    true,
  );
});

test("keeps readiness scoped to application health", () => {
  assert.equal(livenessHealthPayloadSchema.safeParse({ status: "ok" }).success, true);
  assert.equal(
    readinessHealthPayloadSchema.safeParse({ status: "ok", scope: "application" }).success,
    true,
  );
  assert.equal(
    readinessHealthPayloadSchema.safeParse({ status: "not_ready", scope: "application" }).success,
    true,
  );
  assert.equal(
    readinessHealthPayloadSchema.safeParse({
      status: "ok",
      scope: "application",
      postgresql: "ready",
      redis: "ready",
      openai: "ready",
    }).success,
    false,
  );
  assert.equal(
    readinessHealthPayloadSchema.safeParse({ status: "ok", scope: "dependencies" }).success,
    false,
  );
});
