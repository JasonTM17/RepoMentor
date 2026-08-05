import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { ApiErrorEnvelope, ApiProblemCode } from "@repomentor/contracts";
import { API_PROBLEM_CODES } from "@repomentor/contracts";
import type { Response } from "express";

import {
  REQUEST_ID_HEADER,
  resolveRequestId,
  type RequestWithId,
} from "./request-id.middleware.js";

const STATUS_TO_PROBLEM_CODE: ReadonlyMap<number, ApiProblemCode> = new Map([
  [HttpStatus.BAD_REQUEST, API_PROBLEM_CODES.BAD_REQUEST],
  [HttpStatus.UNAUTHORIZED, API_PROBLEM_CODES.UNAUTHORIZED],
  [HttpStatus.FORBIDDEN, API_PROBLEM_CODES.FORBIDDEN],
  [HttpStatus.NOT_FOUND, API_PROBLEM_CODES.NOT_FOUND],
  [HttpStatus.CONFLICT, API_PROBLEM_CODES.CONFLICT],
  [HttpStatus.TOO_MANY_REQUESTS, API_PROBLEM_CODES.RATE_LIMITED],
  [HttpStatus.BAD_GATEWAY, API_PROBLEM_CODES.DEPENDENCY_UNAVAILABLE],
  [HttpStatus.SERVICE_UNAVAILABLE, API_PROBLEM_CODES.DEPENDENCY_UNAVAILABLE],
  [HttpStatus.GATEWAY_TIMEOUT, API_PROBLEM_CODES.DEPENDENCY_UNAVAILABLE],
]);

const PROBLEM_MESSAGES: Readonly<Record<ApiProblemCode, string>> = {
  [API_PROBLEM_CODES.BAD_REQUEST]: "The request is invalid.",
  [API_PROBLEM_CODES.VALIDATION_FAILED]: "One or more fields are invalid.",
  [API_PROBLEM_CODES.UNAUTHORIZED]: "Authentication is required.",
  [API_PROBLEM_CODES.FORBIDDEN]: "You are not allowed to perform this action.",
  [API_PROBLEM_CODES.NOT_FOUND]: "The requested resource was not found.",
  [API_PROBLEM_CODES.CONFLICT]: "The request conflicts with the current state.",
  [API_PROBLEM_CODES.RATE_LIMITED]: "Too many requests. Please try again later.",
  [API_PROBLEM_CODES.DEPENDENCY_UNAVAILABLE]: "A required dependency is unavailable.",
  [API_PROBLEM_CODES.INTERNAL_ERROR]: "An unexpected error occurred.",
};

const MAX_FIELD_ERRORS = 20;
const MAX_MESSAGES_PER_FIELD = 20;
const SAFE_FIELD_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getExceptionMessages(exception: HttpException): readonly unknown[] {
  const response = exception.getResponse();

  if (!isRecord(response) || !Array.isArray(response.message)) {
    return [];
  }

  return response.message;
}

function getSanitizedValidationMessage(detail: string): string {
  const normalizedDetail = detail.toLowerCase();

  if (normalizedDetail.includes("should not be empty")) {
    return "This field is required.";
  }

  if (normalizedDetail.includes("must be an email")) {
    return "Enter a valid email address.";
  }

  if (normalizedDetail.includes("must be a string")) {
    return "Enter a valid text value.";
  }

  if (
    normalizedDetail.includes("must be a number") ||
    normalizedDetail.includes("must be an integer")
  ) {
    return "Enter a valid number.";
  }

  if (normalizedDetail.includes("must be a boolean")) {
    return "Enter a valid boolean value.";
  }

  if (
    normalizedDetail.includes("must be longer") ||
    normalizedDetail.includes("must be shorter") ||
    normalizedDetail.includes("must be between")
  ) {
    return "Enter a value with an allowed length.";
  }

  if (normalizedDetail.includes("must be one of")) {
    return "Select an allowed value.";
  }

  return "The field is invalid.";
}

function parseValidationMessage(message: string): { field: string; message: string } | undefined {
  const normalizedMessage = message.trim();
  const unknownPropertyMatch = normalizedMessage.match(
    /^property ([A-Za-z][A-Za-z0-9_.-]{0,99}) should not exist$/i,
  );

  if (unknownPropertyMatch) {
    const field = unknownPropertyMatch[1];

    if (!field) {
      return undefined;
    }

    return {
      field,
      message: "This field is not allowed.",
    };
  }

  const fieldMessageMatch = normalizedMessage.match(/^([A-Za-z][A-Za-z0-9_.-]{0,99})\s+(.+)$/);

  const field = fieldMessageMatch?.[1];
  const detail = fieldMessageMatch?.[2];

  if (!field || !detail || !SAFE_FIELD_NAME_PATTERN.test(field)) {
    return undefined;
  }

  return {
    field,
    message: getSanitizedValidationMessage(detail),
  };
}

function extractFieldErrors(exception: HttpException): Record<string, string[]> | undefined {
  const fieldErrors = Object.create(null) as Record<string, string[]>;

  for (const message of getExceptionMessages(exception)) {
    if (typeof message !== "string") {
      continue;
    }

    const parsedMessage = parseValidationMessage(message);

    if (!parsedMessage) {
      continue;
    }

    if (!fieldErrors[parsedMessage.field] && Object.keys(fieldErrors).length >= MAX_FIELD_ERRORS) {
      continue;
    }

    const messages = fieldErrors[parsedMessage.field] ?? [];

    if (!messages.includes(parsedMessage.message) && messages.length < MAX_MESSAGES_PER_FIELD) {
      messages.push(parsedMessage.message);
    }

    fieldErrors[parsedMessage.field] = messages;
  }

  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined;
}

function resolveProblemCode(
  statusCode: number,
  fieldErrors: Record<string, string[]> | undefined,
): ApiProblemCode {
  if (fieldErrors) {
    return API_PROBLEM_CODES.VALIDATION_FAILED;
  }

  const knownCode = STATUS_TO_PROBLEM_CODE.get(statusCode);

  if (knownCode) {
    return knownCode;
  }

  return statusCode >= HttpStatus.INTERNAL_SERVER_ERROR
    ? API_PROBLEM_CODES.INTERNAL_ERROR
    : API_PROBLEM_CODES.BAD_REQUEST;
}

function getStatusCode(exception: unknown): number {
  return exception instanceof HttpException
    ? exception.getStatus()
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<RequestWithId>();
    const response = httpContext.getResponse<Response>();
    const requestId = resolveRequestId(request.requestId ?? request.header(REQUEST_ID_HEADER));
    const statusCode = getStatusCode(exception);
    const fieldErrors =
      statusCode === HttpStatus.BAD_REQUEST && exception instanceof HttpException
        ? extractFieldErrors(exception)
        : undefined;
    const code = resolveProblemCode(statusCode, fieldErrors);
    const envelope: ApiErrorEnvelope = {
      error: {
        code,
        message: PROBLEM_MESSAGES[code],
        requestId,
        ...(fieldErrors ? { details: { fieldErrors } } : {}),
      },
    };

    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);
    response.status(statusCode).json(envelope);
  }
}
