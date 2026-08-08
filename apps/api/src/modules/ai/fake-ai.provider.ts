import type { AiProviderRequest, AiProviderResult, AiReviewProvider } from "./ai.types.js";
import type { ReviewResult } from "./review-result.schema.js";

const DEFAULT_FAKE_RESULT: ReviewResult = {
  education: {
    diff: null,
    generatedTests: [],
    improvedSource: null,
    learningQuestions: [],
  },
  schemaVersion: "v1",
  summary: "No actionable findings were detected.",
  findings: [],
};

export type FakeAiProviderResponse =
  | AiProviderResult
  | Error
  | ((
      request: AiProviderRequest,
      callNumber: number,
    ) => AiProviderResult | Promise<AiProviderResult>);

export class FakeAiReviewProvider implements AiReviewProvider {
  readonly requests: AiProviderRequest[] = [];
  private responseIndex = 0;

  constructor(
    private readonly responses: readonly FakeAiProviderResponse[] = [
      { output: DEFAULT_FAKE_RESULT },
    ],
  ) {}

  async review(request: AiProviderRequest): Promise<AiProviderResult> {
    this.requests.push(request);

    const response =
      this.responses[Math.min(this.responseIndex++, this.responses.length - 1)] ??
      ({ output: DEFAULT_FAKE_RESULT } satisfies AiProviderResult);

    if (response instanceof Error) {
      throw response;
    }

    if (typeof response === "function") {
      return response(request, this.requests.length);
    }

    return response;
  }
}

export function createFakeAiProviderResult(
  output: unknown,
  usage?: AiProviderResult["usage"],
): AiProviderResult {
  if (usage !== undefined) {
    return { output, usage };
  }

  return { output };
}
