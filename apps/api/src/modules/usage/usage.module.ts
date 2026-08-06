import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { parseUsageQuotaConfig, USAGE_QUOTA_CONFIG } from "./usage.config.js";
import { UsageController } from "./usage.controller.js";
import { PrismaUsageRepository } from "./prisma-usage.repository.js";
import { USAGE_REPOSITORY } from "./usage.types.js";
import { UsageService } from "./usage.service.js";

@Module({
  controllers: [UsageController],
  imports: [AuthModule],
  providers: [
    PrismaUsageRepository,
    UsageService,
    {
      provide: USAGE_QUOTA_CONFIG,
      useFactory: parseUsageQuotaConfig,
    },
    {
      provide: USAGE_REPOSITORY,
      useExisting: PrismaUsageRepository,
    },
  ],
  exports: [UsageService],
})
export class UsageModule {}
