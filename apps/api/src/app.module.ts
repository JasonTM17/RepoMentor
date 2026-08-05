import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { ResponseEnvelopeInterceptor } from "./common/http/response-envelope.interceptor.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { ReviewModule } from "./modules/review/review.module.js";

@Module({
  imports: [AuthModule, HealthModule, ReviewModule],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseEnvelopeInterceptor,
    },
  ],
})
export class AppModule {}
