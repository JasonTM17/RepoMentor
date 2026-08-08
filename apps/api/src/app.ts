import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { ApiErrorEnvelope, ApiProblemCode } from "@repomentor/contracts";
import { API_PROBLEM_CODES } from "@repomentor/contracts";
import { json, urlencoded } from "express";
import type { NextFunction, Request, Response } from "express";

import { AppModule } from "./app.module.js";
import { ApiExceptionFilter } from "./common/http/api-exception.filter.js";
import {
  REQUEST_ID_HEADER,
  requestIdMiddleware,
  resolveRequestId,
  type RequestWithId,
} from "./common/http/request-id.middleware.js";
import {
  normalizeCorsOrigin,
  normalizeCorsOrigins,
  parseCorsOrigins,
  type NodeEnvironment,
} from "./config/environment.js";
import { createHealthMetricsMiddleware } from "./modules/health/health.metrics.middleware.js";
import { HealthMetricsService } from "./modules/health/health.metrics.js";

const API_PREFIX = "api/v1";
const SWAGGER_PATH = "api/docs";
const HEALTH_ROUTES = ["health/live", "health/ready", "health/metrics"];
export const REQUEST_BODY_LIMIT = "128kb";
export const CONTENT_SECURITY_POLICY =
  "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'";

const CORS_ALLOWED_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;
const CORS_ALLOWED_HEADERS = [
  "Authorization",
  "Content-Type",
  "Idempotency-Key",
  "X-Request-Id",
] as const;
const CORS_ALLOWED_METHODS_HEADER = CORS_ALLOWED_METHODS.join(", ");
const CORS_ALLOWED_HEADERS_HEADER = CORS_ALLOWED_HEADERS.join(", ");
const CORS_ALLOWED_HEADER_NAMES = new Set(
  CORS_ALLOWED_HEADERS.map((header) => header.toLowerCase()),
);
const CORS_MAX_AGE_SECONDS = 600;

export interface AppConfigurationOptions {
  readonly enableSwagger?: boolean;
  readonly nodeEnv?: NodeEnvironment;
  readonly corsOrigins?: readonly string[];
}

function resolveNodeEnvironment(): NodeEnvironment {
  const nodeEnv = process.env.NODE_ENV?.trim();

  if (nodeEnv === "production" || nodeEnv === "test") {
    return nodeEnv;
  }

  return "development";
}

function applySecurityHeaders(response: Response, nodeEnv: NodeEnvironment): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  response.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);

  if (nodeEnv === "production") {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  } else {
    response.removeHeader("Strict-Transport-Security");
  }
}

function securityHeadersMiddleware(nodeEnv: NodeEnvironment) {
  return (_request: Request, response: Response, next: NextFunction): void => {
    applySecurityHeaders(response, nodeEnv);
    next();
  };
}

function writeErrorEnvelope(
  request: RequestWithId,
  response: Response,
  statusCode: number,
  code: ApiProblemCode,
  message: string,
): void {
  const requestId = resolveRequestId(request.requestId ?? request.header(REQUEST_ID_HEADER));
  const envelope: ApiErrorEnvelope = {
    error: {
      code,
      message,
      requestId,
    },
  };

  request.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  response.status(statusCode).json(envelope);
}

function splitHeaderValues(rawHeader: string | undefined): readonly string[] {
  if (!rawHeader) {
    return [];
  }

  return rawHeader
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value !== "");
}

function createCorsMiddleware(corsOrigins: readonly string[]) {
  const allowedOrigins = new Set(corsOrigins);

  return (request: RequestWithId, response: Response, next: NextFunction): void => {
    const rawOrigin = request.header("origin");

    if (!rawOrigin) {
      next();
      return;
    }

    response.setHeader("Vary", "Origin");
    const normalizedOrigin = normalizeCorsOrigin(rawOrigin);

    if (!normalizedOrigin || !allowedOrigins.has(normalizedOrigin)) {
      writeErrorEnvelope(
        request,
        response,
        403,
        API_PROBLEM_CODES.FORBIDDEN,
        "You are not allowed to perform this action.",
      );
      return;
    }

    response.setHeader("Access-Control-Allow-Origin", normalizedOrigin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Expose-Headers", REQUEST_ID_HEADER);

    const requestedMethod = request.header("access-control-request-method")?.trim().toUpperCase();
    const requestedHeaders = splitHeaderValues(request.header("access-control-request-headers"));

    if (request.method === "OPTIONS" && requestedMethod) {
      if (
        !CORS_ALLOWED_METHODS.includes(requestedMethod as (typeof CORS_ALLOWED_METHODS)[number]) ||
        requestedHeaders.some((header) => !CORS_ALLOWED_HEADER_NAMES.has(header))
      ) {
        writeErrorEnvelope(
          request,
          response,
          403,
          API_PROBLEM_CODES.FORBIDDEN,
          "You are not allowed to perform this action.",
        );
        return;
      }

      response.setHeader("Access-Control-Allow-Methods", CORS_ALLOWED_METHODS_HEADER);
      response.setHeader("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS_HEADER);
      response.setHeader("Access-Control-Max-Age", String(CORS_MAX_AGE_SECONDS));
      response.status(204).end();
      return;
    }

    next();
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createBodyParserErrorMiddleware(nodeEnv: NodeEnvironment) {
  return function bodyParserErrorMiddleware(
    error: unknown,
    request: RequestWithId,
    response: Response,
    next: NextFunction,
  ): void {
    if (response.headersSent) {
      next(error);
      return;
    }

    const errorRecord = isRecord(error) ? error : undefined;
    const errorType = typeof errorRecord?.type === "string" ? errorRecord.type : undefined;
    const errorStatus =
      typeof errorRecord?.status === "number" && Number.isInteger(errorRecord.status)
        ? errorRecord.status
        : undefined;

    if (errorType === "entity.too.large" || errorStatus === 413) {
      applySecurityHeaders(response, nodeEnv);
      writeErrorEnvelope(
        request,
        response,
        413,
        API_PROBLEM_CODES.BAD_REQUEST,
        "The request is invalid.",
      );
      return;
    }

    if (errorType === "entity.parse.failed") {
      applySecurityHeaders(response, nodeEnv);
      writeErrorEnvelope(
        request,
        response,
        400,
        API_PROBLEM_CODES.BAD_REQUEST,
        "The request is invalid.",
      );
      return;
    }

    next(error);
  };
}

function resolveCorsOrigins(
  options: AppConfigurationOptions,
  nodeEnv: NodeEnvironment,
): readonly string[] {
  if (options.corsOrigins) {
    return normalizeCorsOrigins(options.corsOrigins);
  }

  return parseCorsOrigins(process.env, nodeEnv);
}

function disableExpressFingerprinting(app: INestApplication): void {
  const expressApplication = app.getHttpAdapter().getInstance() as {
    disable?: (setting: string) => void;
  };

  expressApplication.disable?.("x-powered-by");
}

export function configureApp(
  app: INestApplication,
  options: AppConfigurationOptions = {},
): INestApplication {
  const nodeEnv = options.nodeEnv ?? resolveNodeEnvironment();
  const corsOrigins = resolveCorsOrigins(options, nodeEnv);

  disableExpressFingerprinting(app);
  app.use(securityHeadersMiddleware(nodeEnv));
  app.use(createHealthMetricsMiddleware(app.get(HealthMetricsService)));
  app.use(requestIdMiddleware);
  app.use(createCorsMiddleware(corsOrigins));
  app.use(json({ limit: REQUEST_BODY_LIMIT }));
  app.use(urlencoded({ extended: false, limit: REQUEST_BODY_LIMIT }));
  app.use(createBodyParserErrorMiddleware(nodeEnv));
  app.setGlobalPrefix(API_PREFIX, { exclude: HEALTH_ROUTES });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  if (options.enableSwagger ?? nodeEnv !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("RepoMentor API")
      .setDescription("RepoMentor application programming interface")
      .setVersion("0.1.0")
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(SWAGGER_PATH, app, swaggerDocument, {
      useGlobalPrefix: false,
    });
  }

  app.enableShutdownHooks();
  return app;
}

export async function createApp(options: AppConfigurationOptions = {}): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  return configureApp(app, options);
}
