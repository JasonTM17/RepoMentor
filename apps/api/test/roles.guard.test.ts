import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { AuthenticatedRequest } from "../src/modules/auth/auth-access.guard.js";
import { Roles } from "../src/modules/auth/roles.decorator.js";
import { RolesGuard } from "../src/modules/auth/roles.guard.js";

class AdminEndpoint {
  @Roles("ADMIN")
  handle(): void {}
}

class UnrestrictedEndpoint {
  handle(): void {}
}

function makeContext(
  request: AuthenticatedRequest,
  handler: () => void,
  controller: typeof AdminEndpoint | typeof UnrestrictedEndpoint,
): ExecutionContext {
  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function authenticatedRequest(role: "USER" | "ADMIN"): AuthenticatedRequest {
  return {
    auth: { role, sessionId: "session-123", userId: "user-123" },
  } as AuthenticatedRequest;
}

describe("RolesGuard", () => {
  const guard = new RolesGuard(new Reflector());

  it("allows a matching canonical role", () => {
    const controller = new AdminEndpoint();

    assert.equal(
      guard.canActivate(
        makeContext(authenticatedRequest("ADMIN"), controller.handle, AdminEndpoint),
      ),
      true,
    );
  });

  it("allows an authenticated request when required-role metadata is absent", () => {
    const controller = new UnrestrictedEndpoint();

    assert.equal(
      guard.canActivate(
        makeContext(authenticatedRequest("USER"), controller.handle, UnrestrictedEndpoint),
      ),
      true,
    );
  });

  it("forbids an insufficient role with 403", () => {
    const controller = new AdminEndpoint();

    assert.throws(
      () =>
        guard.canActivate(
          makeContext(authenticatedRequest("USER"), controller.handle, AdminEndpoint),
        ),
      ForbiddenException,
    );
  });

  it("forbids missing or malformed auth roles, including without metadata", () => {
    const controller = new UnrestrictedEndpoint();
    const missingRole = {
      auth: { sessionId: "session-123", userId: "user-123" },
    } as unknown as AuthenticatedRequest;
    const malformedRole = {
      auth: { role: "admin", sessionId: "session-123", userId: "user-123" },
    } as unknown as AuthenticatedRequest;

    assert.throws(
      () => guard.canActivate(makeContext(missingRole, controller.handle, UnrestrictedEndpoint)),
      ForbiddenException,
    );
    assert.throws(
      () => guard.canActivate(makeContext(malformedRole, controller.handle, UnrestrictedEndpoint)),
      ForbiddenException,
    );
  });
});
