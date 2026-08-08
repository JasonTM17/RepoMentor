import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { Response } from "express";
import { tap, type Observable } from "rxjs";

import {
  REQUEST_ID_HEADER,
  resolveRequestId,
  type RequestWithId,
} from "./request-id.middleware.js";
import { AuditLogService } from "../../modules/audit/audit-log.service.js";
import {
  AUDIT_MAX_STATUS_CODE,
  AUDIT_MIN_STATUS_CODE,
  findAuditRoute,
  type AuditLogRecord,
  type AuditOutcome,
  type AuditRouteDefinition,
} from "../../modules/audit/audit.types.js";

export interface AuditRequest extends RequestWithId {
  readonly auth?: {
    readonly userId?: unknown;
    readonly sessionId?: unknown;
  };
}

function normalizeMountedRoute(baseUrl: string, routePath: string): string {
  const mountedRoute = `${baseUrl}/${routePath}`.replace(/\/{2,}/gu, "/");
  const withoutApiPrefix = mountedRoute.replace(/^\/api\/v1(?=\/|$)/u, "");
  const withoutTrailingSlash = withoutApiPrefix.replace(/\/+$/u, "");

  return withoutTrailingSlash || "/";
}

function getRoutePath(request: AuditRequest): string | undefined {
  const routePath = request.route?.path;

  if (typeof routePath !== "string") {
    return undefined;
  }

  return normalizeMountedRoute(request.baseUrl, routePath);
}

function safeActorId(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) {
    return undefined;
  }

  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(value) ? value : undefined;
}

function boundedStatusCode(statusCode: number, fallback: number): number {
  if (
    Number.isInteger(statusCode) &&
    statusCode >= AUDIT_MIN_STATUS_CODE &&
    statusCode <= AUDIT_MAX_STATUS_CODE
  ) {
    return statusCode;
  }

  return fallback;
}

function getExceptionStatus(error: unknown): number | undefined {
  if (
    typeof error !== "object" ||
    error === null ||
    !("getStatus" in error) ||
    typeof error.getStatus !== "function"
  ) {
    return undefined;
  }

  try {
    const status = error.getStatus();
    return typeof status === "number" ? boundedStatusCode(status, 500) : undefined;
  } catch {
    return undefined;
  }
}

function getRequestId(request: AuditRequest): string {
  return resolveRequestId(request.requestId ?? request.header(REQUEST_ID_HEADER));
}

function createActorFields(
  request: AuditRequest,
  route: AuditRouteDefinition,
): Pick<AuditLogRecord, "actorType" | "userId" | "sessionId"> | undefined {
  const userId = safeActorId(request.auth?.userId);
  const sessionId = safeActorId(request.auth?.sessionId);

  if (route.actor === "AUTHENTICATED" && (!userId || !sessionId)) {
    return undefined;
  }

  if (!userId || !sessionId) {
    return { actorType: "ANONYMOUS" };
  }

  return { actorType: "AUTHENTICATED", sessionId, userId };
}

export function createAuditLogRecord(
  request: AuditRequest,
  route: AuditRouteDefinition,
  outcome: AuditOutcome,
  statusCode: number,
  occurredAt = new Date(),
): AuditLogRecord | undefined {
  const actor = createActorFields(request, route);

  if (!actor) {
    return undefined;
  }

  const targetId = route.target === "ID" ? safeActorId(request.params?.id) : undefined;

  return {
    action: route.action,
    actorType: actor.actorType,
    method: route.method,
    occurredAt,
    outcome,
    requestId: getRequestId(request),
    route: route.route,
    statusCode: boundedStatusCode(statusCode, outcome === "FAILURE" ? 500 : 200),
    ...(actor.sessionId === undefined ? {} : { sessionId: actor.sessionId }),
    ...(actor.userId === undefined ? {} : { userId: actor.userId }),
    ...(targetId === undefined ? {} : { targetId }),
  };
}

export function resolveAuditRoute(request: AuditRequest): AuditRouteDefinition | undefined {
  const routePath = getRoutePath(request);
  return routePath ? findAuditRoute(request.method, routePath) : undefined;
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor<unknown, unknown> {
  constructor(private readonly auditLogs: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuditRequest>();
    const response = http.getResponse<Response>();
    const route = resolveAuditRoute(request);
    let recorded = false;

    const enqueue = (outcome: AuditOutcome, statusCode: number): void => {
      if (recorded || !route) {
        return;
      }

      recorded = true;
      const record = createAuditLogRecord(request, route, outcome, statusCode);

      if (!record) {
        return;
      }

      void Promise.resolve()
        .then(() => this.auditLogs.record(record))
        .catch(() => undefined);
    };

    return next.handle().pipe(
      tap({
        error: (error: unknown) => {
          enqueue(
            "FAILURE",
            getExceptionStatus(error) ?? boundedStatusCode(response.statusCode, 500),
          );
        },
        next: () => {
          enqueue("SUCCESS", boundedStatusCode(response.statusCode, 200));
        },
      }),
    );
  }
}
