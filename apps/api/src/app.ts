import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module.js";

const API_PREFIX = "api/v1";
const SWAGGER_PATH = "api/docs";
const HEALTH_ROUTES = ["health/live", "health/ready"];

export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix(API_PREFIX, { exclude: HEALTH_ROUTES });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("RepoMentor API")
    .setDescription("RepoMentor application programming interface")
    .setVersion("0.1.0")
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(SWAGGER_PATH, app, swaggerDocument, {
    useGlobalPrefix: false,
  });

  app.enableShutdownHooks();
  return app;
}

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  return configureApp(app);
}
