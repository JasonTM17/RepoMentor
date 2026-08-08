import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HttpException } from "@nestjs/common";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { AuditLog as PrismaAuditLog, Prisma } from "@prisma/client";
import type { Response } from "express";
import { firstValueFrom, of, throwError, type Observable } from "rxjs";

import { REQUEST_ID_HEADER } from "../../src/common/http/request-id.middleware.js";
import {
  AuditLogInterceptor,
  createAuditLogRecord,
  resolveAuditRoute,
  type AuditRequest,
} from "../../src/common/http/audit-log.interceptor.js";
import { PrismaService } from "../../src/modules/auth/prisma.service.js";
import { AuditLogService } from "../../src/modules/audit/audit-log.service.js";
import { InMemoryAuditLogRepository } from "../../src/modules/audit/in-memory-audit-log.repository.js";
import { PrismaAuditLogRepository } from "../../src/modules/audit/prisma-audit-log.repository.js";
import {
  AUDIT_ACTIONS,
  AUDIT_ROUTE_ALLOWLIST,
  findAuditRoute,
  normalizeAuditLogRecord,
  type AuditLogRecord,
} from "../../src/modules/audit/audit.types.js";

const NOW = new Date("2026-08-08T12:00:00.000Z");

function makeRequest(options: {
  readonly auth?: { readonly sessionId: string; readonly userId: string };
  readonly baseUrl?: string;
  readonly body?: unknown;
  readonly method: string;
  readonly params?: Record<string, string>;
  readonly query?: Record<string, string>;
  readonly requestId?: string;
  readonly routePath: string;
}): AuditRequest {
  const request = {
    auth: options.auth,
    baseUrl: options.baseUrl ?? "/api/v1",
    body: options.body,
    header: (name: string): string | undefined =>
      name.toLowerCase() === REQUEST_ID_HEADER.toLowerCase() ? options.requestId : undefined,
    method: options.method,
    params: options.params ?? {},
    query: options.query ?? {},
    requestId: options.requestId,
    route: { path: options.routePath },
  } as unknown as AuditRequest;

  return request;
}

function makeContext(request: AuditRequest, response: Response): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function makeHandler(source: Observable<unknown>): CallHandler<unknown> {
  return { handle: () => source };
}

async function waitForEntry(repository: InMemoryAuditLogRepository): Promise<AuditLogRecord> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const entry = repository.getEntries()[0];

    if (entry) {
      return entry;
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  assert.fail("timed out waiting for the bounded audit write");
}

function fixedRecord(overrides: Partial<AuditLogRecord> = {}): AuditLogRecord {
  return {
    action: "REVIEW_PROCESS",
    actorType: "AUTHENTICATED",
    method: "POST",
    occurredAt: NOW,
    outcome: "SUCCESS",
    requestId: "audit-test-request-123",
    route: "/reviews/:id/process",
    sessionId: "session-123",
    statusCode: 200,
    targetId: "review-123",
    userId: "owner-123",
    ...overrides,
  };
}

describe("sensitive-action audit logging", () => {
  it("keeps the action set and route mapping explicit", () => {
    assert.equal(AUDIT_ACTIONS.length, AUDIT_ROUTE_ALLOWLIST.length);
    assert.equal(findAuditRoute("POST", "/auth/login")?.action, "AUTH_LOGIN");
    assert.equal(findAuditRoute("POST", "/auth/logout-all")?.action, "SESSION_LOGOUT_ALL");
    assert.equal(findAuditRoute("POST", "/reviews/:id/process")?.action, "REVIEW_PROCESS");
    assert.equal(findAuditRoute("POST", "/reviews/:id/unknown"), undefined);
    assert.equal(findAuditRoute("PUT", "/reviews/:id"), undefined);
  });

  it("records only safe authenticated actor and path target metadata", () => {
    const request = makeRequest({
      auth: { sessionId: "session-owner", userId: "owner-user" },
      body: {
        password: "body-password-must-not-be-read",
        source: "private source must not be read",
        targetId: "body-target-must-not-win",
      },
      method: "POST",
      params: { id: "review-path-target" },
      query: { token: "query-token-must-not-be-read" },
      requestId: "audit-request-123",
      routePath: "/reviews/:id/process",
    });
    const route = resolveAuditRoute(request);

    assert.ok(route);
    const record = createAuditLogRecord(request, route, "SUCCESS", 202, NOW);

    assert.deepEqual(record, {
      action: "REVIEW_PROCESS",
      actorType: "AUTHENTICATED",
      method: "POST",
      occurredAt: NOW,
      outcome: "SUCCESS",
      requestId: "audit-request-123",
      route: "/reviews/:id/process",
      sessionId: "session-owner",
      statusCode: 202,
      targetId: "review-path-target",
      userId: "owner-user",
    });
    assert.equal(JSON.stringify(record).includes("body-password"), false);
    assert.equal(JSON.stringify(record).includes("private source"), false);
    assert.equal(JSON.stringify(record).includes("query-token"), false);
    assert.equal(JSON.stringify(record).includes("body-target"), false);
  });

  it("uses an anonymous actor for public auth actions and never trusts body identity", () => {
    const request = makeRequest({
      body: { userId: "attacker-body-user", sessionId: "attacker-body-session" },
      method: "POST",
      requestId: "anonymous-request-123",
      routePath: "/auth/login",
    });
    const route = resolveAuditRoute(request);

    assert.ok(route);
    const record = createAuditLogRecord(request, route, "FAILURE", 401, NOW);

    assert.deepEqual(record, {
      action: "AUTH_LOGIN",
      actorType: "ANONYMOUS",
      method: "POST",
      occurredAt: NOW,
      outcome: "FAILURE",
      requestId: "anonymous-request-123",
      route: "/auth/login",
      statusCode: 401,
    });
  });

  it("does not create a review audit actor from caller-controlled fields", () => {
    const request = makeRequest({
      body: { userId: "body-owner", sessionId: "body-session" },
      method: "GET",
      query: { userId: "query-owner", sessionId: "query-session" },
      requestId: "ownership-request-123",
      routePath: "/reviews/:id",
    });
    const route = resolveAuditRoute(request);

    assert.ok(route);
    assert.equal(createAuditLogRecord(request, route, "FAILURE", 404, NOW), undefined);
  });

  it("strips actor identifiers from anonymous records at the persistence boundary", () => {
    const normalized = normalizeAuditLogRecord(fixedRecord({ actorType: "ANONYMOUS" }));

    assert.deepEqual(normalized, {
      action: "REVIEW_PROCESS",
      actorType: "ANONYMOUS",
      method: "POST",
      occurredAt: NOW,
      outcome: "SUCCESS",
      requestId: "audit-test-request-123",
      route: "/reviews/:id/process",
      statusCode: 200,
      targetId: "review-123",
    });
  });

  it("writes through the deterministic in-memory repository", async () => {
    const repository = new InMemoryAuditLogRepository();
    const service = new AuditLogService(repository, 50);
    const record = fixedRecord();

    assert.equal(await service.record(record), true);
    assert.deepEqual(repository.getEntries(), [record]);
  });

  it("fails open when the adapter rejects or exceeds the bounded timeout", async () => {
    const rejectingRepository = {
      create: async (): Promise<void> => {
        throw new Error("database unavailable");
      },
    };
    const hangingRepository = {
      create: async (): Promise<void> => new Promise(() => undefined),
    };

    assert.equal(await new AuditLogService(rejectingRepository, 10).record(fixedRecord()), false);

    const startedAt = Date.now();
    assert.equal(await new AuditLogService(hangingRepository, 10).record(fixedRecord()), false);
    assert.ok(Date.now() - startedAt < 500);
  });

  it("records success and failure outcomes without observing response bodies", async () => {
    const repository = new InMemoryAuditLogRepository();
    const interceptor = new AuditLogInterceptor(new AuditLogService(repository, 50));
    const successRequest = makeRequest({
      auth: { sessionId: "session-owner", userId: "owner-user" },
      method: "POST",
      requestId: "interceptor-success-123",
      routePath: "/reviews",
    });
    const successResponse = { statusCode: 201 } as Response;

    await firstValueFrom(
      interceptor.intercept(
        makeContext(successRequest, successResponse),
        makeHandler(of({ source: "response-source-must-not-be-read" })),
      ),
    );
    const successEntry = await waitForEntry(repository);
    assert.equal(successEntry.action, "REVIEW_CREATE");
    assert.equal(successEntry.outcome, "SUCCESS");
    assert.equal(successEntry.statusCode, 201);
    assert.equal("source" in successEntry, false);

    const failureRequest = makeRequest({
      auth: { sessionId: "session-owner", userId: "owner-user" },
      method: "POST",
      params: { id: "review-failure" },
      requestId: "interceptor-failure-123",
      routePath: "/reviews/:id/process",
    });
    const failureResponse = { statusCode: 200 } as Response;

    await assert.rejects(
      firstValueFrom(
        interceptor.intercept(
          makeContext(failureRequest, failureResponse),
          makeHandler(throwError(() => new HttpException({ secret: "hidden" }, 409))),
        ),
      ),
    );
    const entries = repository.getEntries();
    const failureEntry = entries.find((entry) => entry.requestId === "interceptor-failure-123");
    assert.ok(failureEntry);
    assert.equal(failureEntry.outcome, "FAILURE");
    assert.equal(failureEntry.statusCode, 409);
    assert.equal(JSON.stringify(failureEntry).includes("hidden"), false);
  });

  it("does not log routes outside the allowlist", async () => {
    const repository = new InMemoryAuditLogRepository();
    const interceptor = new AuditLogInterceptor(new AuditLogService(repository, 50));
    const request = makeRequest({
      method: "GET",
      requestId: "unlisted-route-123",
      routePath: "/health/live",
    });

    await firstValueFrom(
      interceptor.intercept(
        makeContext(request, { statusCode: 200 } as Response),
        makeHandler(of({ status: "ok" })),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.deepEqual(repository.getEntries(), []);
  });

  it("maps every bounded field through the Prisma adapter without adding request data", async () => {
    let created: Prisma.AuditLogCreateArgs | undefined;
    const transactionClient = {
      auditLog: {
        create: async (args: Prisma.AuditLogCreateArgs): Promise<PrismaAuditLog> => {
          created = args;
          return {} as PrismaAuditLog;
        },
      },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      transaction: async <T>(
        callback: (client: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> => callback(transactionClient),
    } as unknown as PrismaService;
    const repository = new PrismaAuditLogRepository(prisma);

    await repository.create(fixedRecord());

    assert.deepEqual(created, {
      data: {
        action: "REVIEW_PROCESS",
        actorType: "AUTHENTICATED",
        method: "POST",
        occurredAt: NOW,
        outcome: "SUCCESS",
        requestId: "audit-test-request-123",
        route: "/reviews/:id/process",
        sessionId: "session-123",
        statusCode: 200,
        targetId: "review-123",
        userId: "owner-123",
      },
    });
  });
});
