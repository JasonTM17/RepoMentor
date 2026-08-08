export const AUDIT_LOG_REPOSITORY = Symbol("AUDIT_LOG_REPOSITORY");
export const AUDIT_LOG_WRITE_TIMEOUT = Symbol("AUDIT_LOG_WRITE_TIMEOUT");

export const AUDIT_ACTIONS = [
  "AUTH_REGISTER",
  "AUTH_LOGIN",
  "SESSION_REFRESH",
  "SESSION_LOGOUT",
  "SESSION_LOGOUT_ALL",
  "AUTH_ME",
  "AUTH_PASSWORD_CHANGE",
  "REVIEW_CREATE",
  "REVIEW_GUEST_CREATE",
  "REVIEW_LIST",
  "REVIEW_READ",
  "REVIEW_BULK_DELETE",
  "REVIEW_DELETE",
  "REVIEW_RETRY",
  "REVIEW_CANCEL",
  "REVIEW_PROCESS",
  "REVIEW_EVENTS_READ",
  "REVIEW_RESULT_READ",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_OUTCOMES = ["SUCCESS", "FAILURE"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export const AUDIT_ACTOR_TYPES = ["ANONYMOUS", "AUTHENTICATED"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_HTTP_METHODS = ["GET", "POST", "PATCH", "DELETE"] as const;
export type AuditHttpMethod = (typeof AUDIT_HTTP_METHODS)[number];

export const DEFAULT_AUDIT_WRITE_TIMEOUT_MS = 250;
export const AUDIT_MAX_REQUEST_ID_LENGTH = 128;
export const AUDIT_MAX_ROUTE_LENGTH = 128;
export const AUDIT_MAX_TARGET_ID_LENGTH = 64;
export const AUDIT_MAX_STATUS_CODE = 599;
export const AUDIT_MIN_STATUS_CODE = 100;

export interface AuditLogRecord {
  readonly action: AuditAction;
  readonly outcome: AuditOutcome;
  readonly actorType: AuditActorType;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly requestId: string;
  readonly route: string;
  readonly method: AuditHttpMethod;
  readonly statusCode: number;
  readonly targetId?: string;
  readonly occurredAt: Date;
}

export interface AuditLogRepository {
  create(record: AuditLogRecord): Promise<void>;
}

export interface AuditRouteDefinition {
  readonly action: AuditAction;
  readonly actor: "ANY" | "AUTHENTICATED";
  readonly method: AuditHttpMethod;
  readonly route: string;
  readonly target: "NONE" | "ID";
}

export const AUDIT_ROUTE_ALLOWLIST: readonly AuditRouteDefinition[] = [
  {
    action: "AUTH_REGISTER",
    actor: "ANY",
    method: "POST",
    route: "/auth/register",
    target: "NONE",
  },
  { action: "AUTH_LOGIN", actor: "ANY", method: "POST", route: "/auth/login", target: "NONE" },
  {
    action: "SESSION_REFRESH",
    actor: "ANY",
    method: "POST",
    route: "/auth/refresh",
    target: "NONE",
  },
  { action: "SESSION_LOGOUT", actor: "ANY", method: "POST", route: "/auth/logout", target: "NONE" },
  {
    action: "SESSION_LOGOUT_ALL",
    actor: "AUTHENTICATED",
    method: "POST",
    route: "/auth/logout-all",
    target: "NONE",
  },
  { action: "AUTH_ME", actor: "AUTHENTICATED", method: "GET", route: "/auth/me", target: "NONE" },
  {
    action: "AUTH_PASSWORD_CHANGE",
    actor: "AUTHENTICATED",
    method: "PATCH",
    route: "/auth/password",
    target: "NONE",
  },
  {
    action: "REVIEW_CREATE",
    actor: "AUTHENTICATED",
    method: "POST",
    route: "/reviews",
    target: "NONE",
  },
  {
    action: "REVIEW_GUEST_CREATE",
    actor: "ANY",
    method: "POST",
    route: "/guest/reviews",
    target: "NONE",
  },
  {
    action: "REVIEW_LIST",
    actor: "AUTHENTICATED",
    method: "GET",
    route: "/reviews",
    target: "NONE",
  },
  {
    action: "REVIEW_BULK_DELETE",
    actor: "AUTHENTICATED",
    method: "DELETE",
    route: "/reviews",
    target: "NONE",
  },
  {
    action: "REVIEW_EVENTS_READ",
    actor: "AUTHENTICATED",
    method: "GET",
    route: "/reviews/:id/events",
    target: "ID",
  },
  {
    action: "REVIEW_READ",
    actor: "AUTHENTICATED",
    method: "GET",
    route: "/reviews/:id",
    target: "ID",
  },
  {
    action: "REVIEW_DELETE",
    actor: "AUTHENTICATED",
    method: "DELETE",
    route: "/reviews/:id",
    target: "ID",
  },
  {
    action: "REVIEW_RETRY",
    actor: "AUTHENTICATED",
    method: "POST",
    route: "/reviews/:id/retry",
    target: "ID",
  },
  {
    action: "REVIEW_CANCEL",
    actor: "AUTHENTICATED",
    method: "POST",
    route: "/reviews/:id/cancel",
    target: "ID",
  },
  {
    action: "REVIEW_PROCESS",
    actor: "AUTHENTICATED",
    method: "POST",
    route: "/reviews/:id/process",
    target: "ID",
  },
  {
    action: "REVIEW_RESULT_READ",
    actor: "AUTHENTICATED",
    method: "GET",
    route: "/reviews/:id/result",
    target: "ID",
  },
];

export function findAuditRoute(method: string, route: string): AuditRouteDefinition | undefined {
  const normalizedMethod = method.trim().toUpperCase();
  const normalizedRoute = route.trim();

  return AUDIT_ROUTE_ALLOWLIST.find(
    (definition) => definition.method === normalizedMethod && definition.route === normalizedRoute,
  );
}

function isSafeIdentifier(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(value)
  );
}

function isSafeRequestId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= AUDIT_MAX_REQUEST_ID_LENGTH &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(value)
  );
}

function isSafeRoute(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= AUDIT_MAX_ROUTE_LENGTH &&
    /^\/[A-Za-z0-9_:/-]+$/u.test(value)
  );
}

export function normalizeAuditLogRecord(record: AuditLogRecord): AuditLogRecord | undefined {
  if (
    !AUDIT_ACTIONS.includes(record.action) ||
    !AUDIT_OUTCOMES.includes(record.outcome) ||
    !AUDIT_ACTOR_TYPES.includes(record.actorType) ||
    !isSafeRequestId(record.requestId) ||
    !isSafeRoute(record.route) ||
    findAuditRoute(record.method, record.route)?.action !== record.action ||
    (record.targetId !== undefined &&
      !isSafeIdentifier(record.targetId, AUDIT_MAX_TARGET_ID_LENGTH)) ||
    !AUDIT_HTTP_METHODS.includes(record.method) ||
    !Number.isInteger(record.statusCode) ||
    record.statusCode < AUDIT_MIN_STATUS_CODE ||
    record.statusCode > AUDIT_MAX_STATUS_CODE ||
    !(record.occurredAt instanceof Date) ||
    Number.isNaN(record.occurredAt.getTime())
  ) {
    return undefined;
  }

  if (record.actorType === "AUTHENTICATED") {
    if (
      !isSafeIdentifier(record.userId, AUDIT_MAX_TARGET_ID_LENGTH) ||
      !isSafeIdentifier(record.sessionId, AUDIT_MAX_TARGET_ID_LENGTH)
    ) {
      return undefined;
    }

    return { ...record };
  }

  if (record.actorType !== "ANONYMOUS") {
    return undefined;
  }

  return {
    action: record.action,
    actorType: record.actorType,
    occurredAt: record.occurredAt,
    method: record.method,
    outcome: record.outcome,
    requestId: record.requestId,
    route: record.route,
    statusCode: record.statusCode,
    ...(record.targetId === undefined ? {} : { targetId: record.targetId }),
  };
}
