import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { ResponseEnvelopeInterceptor } from "./common/http/response-envelope.interceptor.js";
import { HealthModule } from "./modules/health/health.module.js";

@Module({
  imports: [HealthModule],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseEnvelopeInterceptor,
    },
  ],
})
export class AppModule {}
