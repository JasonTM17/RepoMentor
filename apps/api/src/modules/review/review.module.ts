import { Module } from "@nestjs/common";

import { AiModule } from "../ai/ai.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ReviewController } from "./review.controller.js";
import { PrismaReviewRepository } from "./prisma-review.repository.js";
import { ReviewProcessingService } from "./processing/review-processing.service.js";
import { REVIEW_REPOSITORY } from "./review.types.js";
import { ReviewService } from "./review.service.js";

@Module({
  controllers: [ReviewController],
  imports: [AiModule, AuthModule],
  providers: [
    PrismaReviewRepository,
    ReviewProcessingService,
    ReviewService,
    {
      provide: REVIEW_REPOSITORY,
      useExisting: PrismaReviewRepository,
    },
  ],
  exports: [ReviewProcessingService, ReviewService],
})
export class ReviewModule {}
