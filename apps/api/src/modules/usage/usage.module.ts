import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PrismaQuotaAdmissionRepository } from "./prisma-quota-admission.repository.js";
import { QuotaAdmissionService } from "./quota-admission.service.js";
import { parseUsageQuotaConfig, USAGE_QUOTA_CONFIG } from "./usage.config.js";
import { UsageController } from "./usage.controller.js";
import { PrismaUsageRepository } from "./prisma-usage.repository.js";
import { QUOTA_ADMISSION_REPOSITORY } from "./quota-admission.types.js";
import { USAGE_REPOSITORY } from "./usage.types.js";
import { UsageService } from "./usage.service.js";

@Module({
  controllers: [UsageController],
  imports: [AuthModule],
  providers: [
    PrismaUsageRepository,
    PrismaQuotaAdmissionRepository,
    QuotaAdmissionService,
    UsageService,
    {
      provide: USAGE_QUOTA_CONFIG,
      useFactory: parseUsageQuotaConfig,
    },
    {
      provide: USAGE_REPOSITORY,
      useExisting: PrismaUsageRepository,
    },
    {
      provide: QUOTA_ADMISSION_REPOSITORY,
      useExisting: PrismaQuotaAdmissionRepository,
    },
  ],
  exports: [QuotaAdmissionService, UsageService],
})
export class UsageModule {}
