import { Module } from "@nestjs/common";

import { AiModule } from "../ai/ai.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { UsageModule } from "../usage/usage.module.js";
import { ReviewController } from "./review.controller.js";
import { ReviewEventStreamService } from "./review-events.service.js";
import { PrismaReviewRepository } from "./prisma-review.repository.js";
import { ReviewProcessingService } from "./processing/review-processing.service.js";
import { ReviewRunCoordinator } from "./processing/review-run.coordinator.js";
import { REVIEW_REPOSITORY } from "./review.types.js";
import { ReviewService } from "./review.service.js";

@Module({
  controllers: [ReviewController],
  imports: [AiModule, AuthModule, UsageModule],
  providers: [
    PrismaReviewRepository,
    ReviewEventStreamService,
    ReviewProcessingService,
    ReviewRunCoordinator,
    ReviewService,
    {
      provide: REVIEW_REPOSITORY,
      useExisting: PrismaReviewRepository,
    },
  ],
  exports: [ReviewProcessingService, ReviewService],
})
export class ReviewModule {}
