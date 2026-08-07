import { Inject, Injectable } from "@nestjs/common";

import { AiReviewService } from "../ai/ai-review.service.js";
import { GUEST_IDENTITY_CONFIG, type GuestIdentityConfig } from "./guest.config.js";
import { deriveGuestIdentity } from "./guest.identity.js";
import { GuestReviewRateLimitError, GuestReviewUnavailableError } from "./guest.errors.js";
import type { GuestReviewInput, GuestReviewResponse } from "./guest.types.js";
import { reserveQuota } from "../redis/redis.quota.js";
import { REDIS_COMMAND_EXECUTOR, type RedisCommandExecutor } from "../redis/redis.types.js";
import { USAGE_REDIS_CONFIG, type UsageRedisConfig } from "../usage/usage.config.js";

function utcDayFor(now: Date): string {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new GuestReviewUnavailableError();
  }

  return now.toISOString().slice(0, 10);
}

function toResponse(
  execution: Awaited<ReturnType<AiReviewService["review"]>>,
): GuestReviewResponse {
  return {
    execution: {
      attempts: execution.attempts,
      durationMs: execution.durationMs,
      model: execution.model,
      provider: execution.provider,
      reasoningEffort: execution.reasoningEffort,
      usage: execution.usage ?? null,
    },
    result: execution.result,
  };
}

@Injectable()
export class GuestReviewService {
  constructor(
    private readonly aiReviewService: AiReviewService,
    @Inject(REDIS_COMMAND_EXECUTOR)
    private readonly redisExecutor: RedisCommandExecutor,
    @Inject(USAGE_REDIS_CONFIG)
    private readonly redisConfig: UsageRedisConfig,
    @Inject(GUEST_IDENTITY_CONFIG)
    private readonly identityConfig: GuestIdentityConfig,
  ) {}

  async review(
    input: GuestReviewInput,
    remoteAddress: unknown,
    now = new Date(),
  ): Promise<GuestReviewResponse> {
    let identity: string;

    try {
      identity = deriveGuestIdentity(remoteAddress, this.identityConfig?.secret);
    } catch {
      throw new GuestReviewUnavailableError();
    }

    let quota: Awaited<ReturnType<typeof reserveQuota>>;

    try {
      quota = await reserveQuota(this.redisExecutor, this.redisConfig, {
        identity,
        mode: "QUICK",
        namespace: "guest",
        now,
        utcDay: utcDayFor(now),
      });
    } catch {
      throw new GuestReviewUnavailableError();
    }

    if (!quota.allowed) {
      throw new GuestReviewRateLimitError(quota.retryAfterSeconds);
    }

    const execution = await this.aiReviewService.review({
      language: input.language,
      mode: "QUICK",
      source: input.source,
    });

    return toResponse(execution);
  }
}
