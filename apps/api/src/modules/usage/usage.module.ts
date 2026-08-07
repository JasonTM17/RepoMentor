import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { createUsageRedisExecutor } from "../redis/redis-admission.provider.js";
import { PrismaQuotaAdmissionRepository } from "./prisma-quota-admission.repository.js";
import { PrismaReviewFinalizer } from "./prisma-review-finalizer.js";
import { QuotaAdmissionService } from "./quota-admission.service.js";
import {
  parseQuotaAdmissionFingerprintConfig,
  QUOTA_ADMISSION_FINGERPRINT_CONFIG,
  type QuotaAdmissionFingerprintConfig,
} from "./quota-admission.config.js";
import {
  QuotaAdmissionHttpService,
  QUOTA_ADMISSION_REDIS_EXECUTOR,
} from "./quota-admission-http.service.js";
import { QuotaAdmissionUnavailableError } from "./quota-admission-http.errors.js";
import {
  parseUsageQuotaConfig,
  parseUsageRedisConfig,
  USAGE_QUOTA_CONFIG,
  USAGE_REDIS_CONFIG,
} from "./usage.config.js";
import { UsageController } from "./usage.controller.js";
import { PrismaUsageRepository } from "./prisma-usage.repository.js";
import { QUOTA_ADMISSION_REPOSITORY } from "./quota-admission.types.js";
import { REVIEW_FINALIZER } from "./review-finalizer.types.js";
import { USAGE_REPOSITORY } from "./usage.types.js";
import { UsageService } from "./usage.service.js";

function unavailableFingerprintConfig(): QuotaAdmissionFingerprintConfig {
  return Object.defineProperty({}, "fingerprintSecret", {
    get(): never {
      throw new QuotaAdmissionUnavailableError();
    },
  }) as QuotaAdmissionFingerprintConfig;
}

function parseTransportFingerprintConfig(): QuotaAdmissionFingerprintConfig {
  try {
    return parseQuotaAdmissionFingerprintConfig();
  } catch (error) {
    if (process.env.NODE_ENV !== "production" && !process.env.REDIS_URL?.trim()) {
      return unavailableFingerprintConfig();
    }

    throw error;
  }
}

@Module({
  controllers: [UsageController],
  imports: [AuthModule],
  providers: [
    PrismaUsageRepository,
    PrismaQuotaAdmissionRepository,
    PrismaReviewFinalizer,
    QuotaAdmissionService,
    QuotaAdmissionHttpService,
    UsageService,
    {
      provide: QUOTA_ADMISSION_FINGERPRINT_CONFIG,
      useFactory: parseTransportFingerprintConfig,
    },
    {
      provide: USAGE_QUOTA_CONFIG,
      useFactory: parseUsageQuotaConfig,
    },
    {
      provide: USAGE_REDIS_CONFIG,
      useFactory: parseUsageRedisConfig,
    },
    {
      provide: QUOTA_ADMISSION_REDIS_EXECUTOR,
      useFactory: createUsageRedisExecutor,
    },
    {
      provide: USAGE_REPOSITORY,
      useExisting: PrismaUsageRepository,
    },
    {
      provide: QUOTA_ADMISSION_REPOSITORY,
      useExisting: PrismaQuotaAdmissionRepository,
    },
    {
      provide: REVIEW_FINALIZER,
      useExisting: PrismaReviewFinalizer,
    },
  ],
  exports: [QuotaAdmissionHttpService, QuotaAdmissionService, UsageService],
})
export class UsageModule {}
