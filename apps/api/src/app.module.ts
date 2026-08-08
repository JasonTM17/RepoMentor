import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { AuditLogInterceptor } from "./common/http/audit-log.interceptor.js";
import { ResponseEnvelopeInterceptor } from "./common/http/response-envelope.interceptor.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { AiModule } from "./modules/ai/ai.module.js";
import { AuditModule } from "./modules/audit/audit.module.js";
import { GuestModule } from "./modules/guest/guest.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { ReviewModule } from "./modules/review/review.module.js";
import { UsageModule } from "./modules/usage/usage.module.js";

@Module({
  imports: [
    AiModule,
    AuditModule,
    AuthModule,
    GuestModule,
    HealthModule,
    ReviewModule,
    UsageModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseEnvelopeInterceptor,
    },
  ],
})
export class AppModule {}
