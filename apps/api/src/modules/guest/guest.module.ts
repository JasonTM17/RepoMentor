import { Module } from "@nestjs/common";

import { AiModule } from "../ai/ai.module.js";
import { UsageModule } from "../usage/usage.module.js";
import { resolveGuestIdentityConfig, GUEST_IDENTITY_CONFIG } from "./guest.config.js";
import { GuestReviewController } from "./guest.controller.js";
import { GuestReviewService } from "./guest.service.js";

@Module({
  controllers: [GuestReviewController],
  imports: [AiModule, UsageModule],
  providers: [
    GuestReviewService,
    {
      provide: GUEST_IDENTITY_CONFIG,
      useFactory: resolveGuestIdentityConfig,
    },
  ],
})
export class GuestModule {}
