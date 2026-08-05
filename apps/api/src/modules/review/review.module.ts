import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { ReviewController } from "./review.controller.js";
import { PrismaReviewRepository } from "./prisma-review.repository.js";
import { REVIEW_REPOSITORY } from "./review.types.js";
import { ReviewService } from "./review.service.js";

@Module({
  controllers: [ReviewController],
  imports: [AuthModule],
  providers: [
    PrismaReviewRepository,
    ReviewService,
    {
      provide: REVIEW_REPOSITORY,
      useExisting: PrismaReviewRepository,
    },
  ],
  exports: [ReviewService],
})
export class ReviewModule {}
