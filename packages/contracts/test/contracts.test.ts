import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  API_PROBLEM_CODES,
  accessTokenAuthResultSchema,
  apiErrorEnvelopeSchema,
  apiProblemSchema,
  apiSuccessEnvelopeSchema,
  authLoginInputSchema,
  authRegisterInputSchema,
  createApiSuccessEnvelopeSchema,
  livenessHealthPayloadSchema,
  publicUserSchema,
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

test("accepts valid auth inputs, public users, and access-token results", () => {
  const registerInput = {
    email: "  ADA@EXAMPLE.COM ",
    password: "correct horse battery staple",
    displayName: "  Ada Lovelace ",
  };
  const loginInput = {
    email: "ADA@EXAMPLE.COM",
    password: "correct horse battery staple",
  };
  const publicUser = {
    id: "user-123",
    email: "ada@example.com",
    displayName: "Ada Lovelace",
    role: "USER",
    status: "ACTIVE",
    createdAt: "2026-08-05T12:00:00.000Z",
    updatedAt: "2026-08-05T12:00:00.000Z",
  };
  const authResult = {
    accessToken: "eyJhbGciOiJIUzI1NiJ9.safe-access-token",
    tokenType: "Bearer",
    expiresInSeconds: 900,
    user: publicUser,
  };

  const parsedRegister = authRegisterInputSchema.safeParse(registerInput);
  assert.equal(parsedRegister.success, true);
  if (parsedRegister.success) {
    assert.equal(parsedRegister.data.email, "ada@example.com");
    assert.equal(parsedRegister.data.displayName, "Ada Lovelace");
  }

  const parsedLogin = authLoginInputSchema.safeParse(loginInput);
  assert.equal(parsedLogin.success, true);
  if (parsedLogin.success) {
    assert.equal(parsedLogin.data.email, "ada@example.com");
  }

  assert.equal(publicUserSchema.safeParse(publicUser).success, true);
  assert.equal(accessTokenAuthResultSchema.safeParse(authResult).success, true);
});

test("rejects unsafe and unknown auth fields", () => {
  const registerInput = {
    email: "ada@example.com",
    password: "correct horse battery staple",
    displayName: "Ada Lovelace",
  };
  const loginInput = {
    email: "ada@example.com",
    password: "correct horse battery staple",
  };
  const publicUser = {
    id: "user-123",
    email: "ada@example.com",
    displayName: "Ada Lovelace",
    role: "USER",
    status: "ACTIVE",
    createdAt: "2026-08-05T12:00:00.000Z",
    updatedAt: "2026-08-05T12:00:00.000Z",
  };
  const authResult = {
    accessToken: "eyJhbGciOiJIUzI1NiJ9.safe-access-token",
    tokenType: "Bearer",
    expiresInSeconds: 900,
    user: publicUser,
  };

  const schemasAndPayloads = [
    [authRegisterInputSchema, registerInput],
    [authLoginInputSchema, loginInput],
    [publicUserSchema, publicUser],
    [accessTokenAuthResultSchema, authResult],
  ] as const;

  for (const [schema, payload] of schemasAndPayloads) {
    assert.equal(schema.safeParse({ ...payload, unexpected: true }).success, false);
  }

  for (const unsafeField of ["passwordHash", "refreshToken", "refreshTokenHash", "cookie"]) {
    assert.equal(
      authRegisterInputSchema.safeParse({ ...registerInput, [unsafeField]: "secret" }).success,
      false,
    );
    assert.equal(
      authLoginInputSchema.safeParse({ ...loginInput, [unsafeField]: "secret" }).success,
      false,
    );
    assert.equal(
      publicUserSchema.safeParse({ ...publicUser, [unsafeField]: "secret" }).success,
      false,
    );
    assert.equal(
      accessTokenAuthResultSchema.safeParse({ ...authResult, [unsafeField]: "secret" }).success,
      false,
    );
  }

  assert.equal(
    accessTokenAuthResultSchema.safeParse({
      ...authResult,
      user: { ...publicUser, passwordHash: "argon2id-hash" },
    }).success,
    false,
  );
  assert.equal(
    authRegisterInputSchema.safeParse({
      ...registerInput,
      password: "x".repeat(129),
    }).success,
    false,
  );
  assert.equal(
    accessTokenAuthResultSchema.safeParse({ ...authResult, expiresInSeconds: 3_601 }).success,
    false,
  );
});
