import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "X-Request-Id";
export const MAX_REQUEST_ID_LENGTH = 128;

const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

export type RequestWithId = Request & { requestId?: string };

export function resolveRequestId(rawRequestId: string | string[] | undefined): string {
  const candidate = typeof rawRequestId === "string" ? rawRequestId.trim() : undefined;

  if (
    candidate &&
    candidate.length <= MAX_REQUEST_ID_LENGTH &&
    SAFE_REQUEST_ID_PATTERN.test(candidate)
  ) {
    return candidate;
  }

  return randomUUID();
}

export function requestIdMiddleware(
  request: RequestWithId,
  response: Response,
  next: NextFunction,
): void {
  const requestId = resolveRequestId(request.header(REQUEST_ID_HEADER));

  request.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
