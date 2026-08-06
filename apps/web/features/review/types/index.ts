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

export type ReviewMode = "QUICK" | "STANDARD" | "DEEP";

export type ReviewSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ReviewCategory = "BUG" | "SECURITY" | "PERFORMANCE" | "MAINTAINABILITY" | "STYLE";

export type ReviewStatus = "idle" | "loading" | "processing" | "success" | "empty" | "error";

export type ReviewTextField = "source" | "title" | "context";

export interface ReviewDraft {
  readonly source: string;
  readonly language: ReviewLanguage;
  readonly learnerLevel: LearnerLevel;
  readonly mode: ReviewMode;
  readonly title: string;
  readonly context: string;
}

export type ReviewFieldErrors = Partial<Record<ReviewTextField, string>>;

export interface ReviewMetrics {
  readonly characterCount: number;
  readonly estimatedTokenCount: number;
  readonly lineCount: number;
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
  readonly process: (reviewId: string) => Promise<ReviewProcessResponse>;
  readonly getResult: (reviewId: string) => Promise<ReviewResultResponse>;
}

export type ReviewTransportFactory = (draft: ReviewDraft) => ReviewTransport;
