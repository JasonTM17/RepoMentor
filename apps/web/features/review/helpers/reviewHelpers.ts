import type {
  ReviewDraft,
  ReviewFieldErrors,
  ReviewMetrics,
  ReviewResult,
  ReviewTextField,
} from "@/features/review/types";

export const REVIEW_MAX_SOURCE_LENGTH = 100_000;
export const REVIEW_MAX_TITLE_LENGTH = 80;
export const REVIEW_MAX_CONTEXT_LENGTH = 500;

export const createInitialReviewDraft = (): ReviewDraft => ({
  source: `const buildLesson = (finding: Finding | null) => {
  if (!finding) {
    return "No lesson yet";
  }

  return {
    title: finding.title,
    nextStep: finding.fix,
  };
};`,
  language: "typescript",
  learnerLevel: "intermediate",
  mode: "STANDARD",
  title: "Guard clause lesson",
  context: "Focus on keeping the changed line easy to explain to the next reviewer.",
});

export const estimateReviewMetrics = (source: string): ReviewMetrics => {
  const trimmedSource = source.trim();

  return {
    characterCount: source.length,
    estimatedTokenCount: trimmedSource.length === 0 ? 0 : Math.ceil(trimmedSource.length / 4),
    lineCount: source.length === 0 ? 0 : source.split(/\r?\n/u).length,
  };
};

export const validateReviewField = (field: ReviewTextField, value: string): string | undefined => {
  if (field === "source") {
    if (value.trim().length === 0) {
      return "Paste a code change before starting the review.";
    }

    if (value.length > REVIEW_MAX_SOURCE_LENGTH) {
      return `Keep the source under ${REVIEW_MAX_SOURCE_LENGTH.toLocaleString()} characters.`;
    }

    return undefined;
  }

  if (field === "title" && value.length > REVIEW_MAX_TITLE_LENGTH) {
    return `Keep the title under ${REVIEW_MAX_TITLE_LENGTH} characters.`;
  }

  if (field === "context" && value.length > REVIEW_MAX_CONTEXT_LENGTH) {
    return `Keep the context under ${REVIEW_MAX_CONTEXT_LENGTH} characters.`;
  }

  return undefined;
};

export const validateReviewDraft = (draft: ReviewDraft): ReviewFieldErrors => {
  const fields: readonly ReviewTextField[] = ["source", "title", "context"];

  return fields.reduce<ReviewFieldErrors>((errors, field) => {
    const error = validateReviewField(field, draft[field]);

    if (error) {
      errors[field] = error;
    }

    return errors;
  }, {});
};

const getFixtureFileExtension = (language: ReviewDraft["language"]): string => {
  switch (language) {
    case "javascript":
      return "js";
    case "python":
      return "py";
    case "go":
      return "go";
    case "typescript":
      return "ts";
  }
};

export const createDeterministicFixtureResult = (draft: ReviewDraft): ReviewResult => {
  const metrics = estimateReviewMetrics(draft.source);
  const firstCodeLine = Math.min(Math.max(metrics.lineCount > 0 ? 1 : 0, 1), metrics.lineCount);
  const secondCodeLine = Math.min(firstCodeLine + 2, Math.max(metrics.lineCount, firstCodeLine));
  const filePath = `review-input.${getFixtureFileExtension(draft.language)}`;

  if (/no findings/iu.test(draft.source)) {
    return {
      schemaVersion: "v1",
      summary: "The deterministic fixture returned no issue signals for this source.",
      findings: [],
    };
  }

  return {
    schemaVersion: "v1",
    summary:
      "The deterministic fixture returns two teaching signals so the workspace can exercise summary, issue, and learning sections.",
    findings: [
      {
        severity: "MEDIUM",
        category: "MAINTAINABILITY",
        title: "Keep the boundary check close to the input",
        description:
          "The early return makes the missing-value path visible before the rest of the function reads from the input.",
        suggestion:
          "Keep this guard at the boundary and name the fallback so the next change has one clear decision to extend.",
        filePath,
        startLine: firstCodeLine,
        endLine: firstCodeLine,
      },
      {
        severity: "LOW",
        category: "STYLE",
        title: "Keep the learning payload consistent",
        description:
          "The returned object carries the lesson fields together, which makes the review outcome easier to scan.",
        suggestion:
          "Use one stable shape for the returned lesson and keep the field names aligned with the explanation.",
        filePath,
        startLine: secondCodeLine,
        endLine: secondCodeLine,
      },
    ],
  };
};
