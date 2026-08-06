import { Inject, Injectable } from "@nestjs/common";

import { AiProviderError, AiValidationError, asAiProviderError } from "./ai.errors.js";
import {
  AI_MAX_RESULT_RETRIES,
  mapReviewModeToReasoningEffort,
  validateAiReviewRequest,
} from "./ai.policy.js";
import { parseReviewResult, type ReviewResult } from "./review-result.schema.js";
import { VersionedCodeReviewPromptBuilder } from "./review-prompt.builder.js";
import {
  AI_MODEL,
  AI_PROVIDER,
  AI_REVIEW_PROVIDER,
  type AiProviderRequest,
  type AiReviewExecution,
  type AiReviewProvider,
  type AiReviewRequest,
} from "./ai.types.js";

@Injectable()
export class AiReviewService {
  constructor(
    @Inject(AI_REVIEW_PROVIDER) private readonly provider: AiReviewProvider,
    private readonly promptBuilder: VersionedCodeReviewPromptBuilder = new VersionedCodeReviewPromptBuilder(),
  ) {}

  async review(
    input: AiReviewRequest,
    signal?: AbortSignal,
  ): Promise<AiReviewExecution<ReviewResult>> {
    if (signal?.aborted) {
      throw new AiProviderError("CANCELLED");
    }

    const request = validateAiReviewRequest(input);
    const reasoningEffort = mapReviewModeToReasoningEffort(request.mode);
    const startedAt = Date.now();

    for (let attempt = 0; attempt <= AI_MAX_RESULT_RETRIES; attempt += 1) {
      if (signal?.aborted) {
        throw new AiProviderError("CANCELLED");
      }

      const providerRequest: AiProviderRequest = {
        provider: AI_PROVIDER,
        model: AI_MODEL,
        reasoningEffort,
        prompt: this.promptBuilder.build(request, { repair: attempt > 0 }),
        attempt,
        ...(signal === undefined ? {} : { signal }),
      };

      let providerResult;

      try {
        providerResult = await this.provider.review(providerRequest);
      } catch (error: unknown) {
        throw asAiProviderError(error);
      }

      try {
        if (signal?.aborted) {
          throw new AiProviderError("CANCELLED");
        }

        const result = parseReviewResult(providerResult.output, request.source);
        const execution: AiReviewExecution<ReviewResult> = {
          provider: AI_PROVIDER,
          model: AI_MODEL,
          reasoningEffort,
          result,
          durationMs: Math.max(0, Date.now() - startedAt),
          attempts: attempt + 1,
          ...(providerResult.usage === undefined ? {} : { usage: providerResult.usage }),
        };

        return execution;
      } catch (error: unknown) {
        if (error instanceof AiProviderError) {
          throw error;
        }

        if (!(error instanceof AiValidationError)) {
          throw new AiProviderError("MALFORMED_RESPONSE");
        }

        if (attempt === AI_MAX_RESULT_RETRIES) {
          throw new AiValidationError({ attempts: attempt + 1 });
        }
      }
    }

    throw new AiValidationError({ attempts: AI_MAX_RESULT_RETRIES + 1 });
  }
}
