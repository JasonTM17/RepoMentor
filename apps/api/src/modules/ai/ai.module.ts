import { Module } from "@nestjs/common";

import { AiReviewService } from "./ai-review.service.js";
import { AI_REVIEW_PROVIDER } from "./ai.types.js";
import { LunaOpenAiProvider } from "./luna-openai.provider.js";
import { VersionedCodeReviewPromptBuilder } from "./review-prompt.builder.js";

@Module({
  providers: [
    VersionedCodeReviewPromptBuilder,
    {
      provide: AI_REVIEW_PROVIDER,
      useFactory: () => new LunaOpenAiProvider(),
    },
    AiReviewService,
  ],
  exports: [AiReviewService],
})
export class AiModule {}
