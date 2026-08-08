export type ReviewLanguage =
  | "javascript"
  | "typescript"
  | "java"
  | "python"
  | "go"
  | "sql"
  | "csharp"
  | "cpp"
  | "rust"
  | "other";

export type LearnerLevel = "beginner" | "intermediate" | "advanced";
export type ReviewApiLearnerLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

export type ReviewMode = "QUICK" | "STANDARD" | "DEEP";

export type ReviewSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ReviewCategory = "BUG" | "SECURITY" | "PERFORMANCE" | "MAINTAINABILITY" | "STYLE";

export type ReviewStatus = "idle" | "loading" | "processing" | "success" | "empty" | "error";

export type ReviewLifecycleStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type ReviewLifecycleEvent =
  | {
      readonly generation: number;
      readonly id: string;
      readonly replay: "current" | "reset";
      readonly resultAvailable: boolean;
      readonly reviewId: string;
      readonly retryable?: boolean;
      readonly schemaVersion: "v1";
      readonly status: ReviewLifecycleStatus;
      readonly type: "snapshot";
    }
  | {
      readonly generation: number;
      readonly id: string;
      readonly resultAvailable: true;
      readonly reviewId: string;
      readonly schemaVersion: "v1";
      readonly status: "COMPLETED";
      readonly type: "completed";
    }
  | {
      readonly generation: number;
      readonly id: string;
      readonly resultAvailable: false;
      readonly retryable: boolean;
      readonly reviewId: string;
      readonly schemaVersion: "v1";
      readonly status: "FAILED";
      readonly type: "failed";
    }
  | {
      readonly generation: number;
      readonly id: string;
      readonly resultAvailable: false;
      readonly reviewId: string;
      readonly schemaVersion: "v1";
      readonly status: "CANCELLED";
      readonly type: "cancelled";
    }
  | {
      readonly generation: number;
      readonly id: string;
      readonly resultAvailable: boolean;
      readonly reviewId: string;
      readonly schemaVersion: "v1";
      readonly status: ReviewLifecycleStatus;
      readonly type: "heartbeat";
    };

export interface ReviewStreamOptions {
  readonly lastEventId?: string | undefined;
  readonly onEvent?: ((event: ReviewLifecycleEvent) => void) | undefined;
  readonly signal?: AbortSignal | undefined;
}

export type ReviewStreamOutcome =
  | { readonly kind: "disconnected" }
  | {
      readonly event: ReviewLifecycleEvent;
      readonly kind: "terminal";
    };

export type ReviewTextField = "source" | "title" | "context";

export interface ReviewDraft {
  readonly source: string;
  readonly language: ReviewLanguage;
  readonly learnerLevel: LearnerLevel;
  readonly mode: ReviewMode;
  readonly title: string;
  readonly context: string;
}

export interface ReviewAdmissionResponse {
  readonly createdAt: string;
  readonly id: string;
  readonly language: string;
  readonly learnerLevel: ReviewApiLearnerLevel;
  readonly mode: ReviewMode;
  readonly title?: string;
  readonly context?: string;
  readonly status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  readonly updatedAt: string;
}

export interface ReviewCancelResponse extends Omit<ReviewAdmissionResponse, "status"> {
  readonly status: "CANCELLED";
}

export type ReviewFieldErrors = Partial<Record<ReviewTextField, string>>;

export interface ReviewMetrics {
  readonly characterCount: number;
  readonly lineCount: number;
}

/**
 * Optional result views are kept separate from the accepted live result contract.
 * The current demo transport does not provide this data.
 */
export interface ReviewOptionalResultData {
  readonly diff?: string;
  readonly generatedTests?: readonly string[];
  readonly generatedTest?: string;
  readonly improvedCode?: string;
  readonly improvedSource?: string;
  readonly learningQuestions?: readonly string[];
  readonly learningQuestion?: string;
  readonly originalSource?: string;
}

export interface ReviewEducation {
  readonly diff: string | null;
  readonly generatedTests: readonly string[];
  readonly improvedSource: string | null;
  readonly learningQuestions: readonly string[];
}

export interface ReviewFinding {
  readonly severity: ReviewSeverity;
  readonly category: ReviewCategory;
  readonly title: string;
  readonly description: string;
  readonly suggestion: string;
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface ReviewResult {
  readonly education: ReviewEducation;
  readonly schemaVersion: "v1";
  readonly summary: string;
  readonly findings: readonly ReviewFinding[];
}

export interface ReviewUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly cachedInputTokens?: number;
}

export interface ReviewExecution {
  readonly attempts: number;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly model: "gpt-5.6-luna";
  readonly provider: "luna";
  readonly reasoningEffort: "low" | "medium" | "max";
  readonly usage: ReviewUsage | null;
}

export interface ReviewResultResponse {
  readonly execution: ReviewExecution;
  readonly id: string;
  readonly result: ReviewResult;
  readonly status: "COMPLETED";
}

export type ReviewProcessResponse =
  | {
      readonly id: string;
      readonly outcome: "COMPLETED";
      readonly resultAvailable: true;
      readonly status: "COMPLETED";
    }
  | {
      readonly id: string;
      readonly outcome: "SKIPPED";
      readonly reason: "ALREADY_COMPLETED";
      readonly resultAvailable: true;
      readonly status: "COMPLETED";
    }
  | {
      readonly id: string;
      readonly outcome: "SKIPPED";
      readonly reason: "ALREADY_PROCESSING";
      readonly resultAvailable: false;
      readonly status: "PROCESSING";
    };

export interface ReviewTransport {
  readonly cancel?: (reviewId: string) => Promise<ReviewCancelResponse>;
  readonly create?: (draft: ReviewDraft) => Promise<ReviewAdmissionResponse>;
  readonly process: (reviewId: string) => Promise<ReviewProcessResponse>;
  readonly getResult: (reviewId: string) => Promise<ReviewResultResponse>;
  readonly stream?: (
    reviewId: string,
    options?: ReviewStreamOptions,
  ) => Promise<ReviewStreamOutcome>;
}

export type ReviewTransportFactory = (draft: ReviewDraft) => ReviewTransport;
