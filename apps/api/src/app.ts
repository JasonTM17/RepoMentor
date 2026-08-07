import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NextFunction, Request, Response } from "express";

import { AppModule } from "./app.module.js";
import { ApiExceptionFilter } from "./common/http/api-exception.filter.js";
import { requestIdMiddleware } from "./common/http/request-id.middleware.js";
import { createHealthMetricsMiddleware } from "./modules/health/health.metrics.middleware.js";
import { HealthMetricsService } from "./modules/health/health.metrics.js";

const API_PREFIX = "api/v1";
const SWAGGER_PATH = "api/docs";
const HEALTH_ROUTES = ["health/live", "health/ready", "health/metrics"];

export interface AppConfigurationOptions {
  readonly enableSwagger?: boolean;
}

function securityHeadersMiddleware(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  next();
}

export function configureApp(
  app: INestApplication,
  options: AppConfigurationOptions = {},
): INestApplication {
  app.use(securityHeadersMiddleware);
  app.use(createHealthMetricsMiddleware(app.get(HealthMetricsService)));
  app.use(requestIdMiddleware);
  app.setGlobalPrefix(API_PREFIX, { exclude: HEALTH_ROUTES });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  if (options.enableSwagger ?? process.env.NODE_ENV !== "production") {
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
  const app = await NestFactory.create(AppModule);
  return configureApp(app, options);
}
