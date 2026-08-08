import type {
  ReviewFinding,
  ReviewOptionalResultData,
  ReviewResultResponse,
} from "@/features/review/types";

interface ReviewExportPayload {
  readonly id: string;
  readonly result: {
    readonly findings: readonly ReviewFinding[];
    readonly schemaVersion: "v1";
    readonly summary: string;
  };
  readonly optional?: ReviewOptionalResultData;
}

const hasText = (value: string | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

const getExportOptionalData = (
  optionalData: ReviewOptionalResultData | undefined,
): ReviewOptionalResultData | undefined => {
  if (!optionalData) {
    return undefined;
  }

  const generatedTests = (optionalData.generatedTests ?? []).filter(hasText);
  const learningQuestions = (optionalData.learningQuestions ?? []).filter(hasText);
  const presentData = {
    ...(hasText(optionalData.diff) ? { diff: optionalData.diff } : {}),
    ...(generatedTests.length > 0 ? { generatedTests } : {}),
    ...(hasText(optionalData.generatedTest) ? { generatedTest: optionalData.generatedTest } : {}),
    ...(hasText(optionalData.improvedCode) ? { improvedCode: optionalData.improvedCode } : {}),
    ...(hasText(optionalData.improvedSource)
      ? { improvedSource: optionalData.improvedSource }
      : {}),
    ...(learningQuestions.length > 0 ? { learningQuestions } : {}),
    ...(hasText(optionalData.learningQuestion)
      ? { learningQuestion: optionalData.learningQuestion }
      : {}),
    ...(hasText(optionalData.originalSource)
      ? { originalSource: optionalData.originalSource }
      : {}),
  };

  return Object.values(presentData).some((value) => value !== undefined) ? presentData : undefined;
};

export const createReviewExportPayload = (
  result: ReviewResultResponse,
  optionalData?: ReviewOptionalResultData,
): ReviewExportPayload => {
  const presentOptionalData = getExportOptionalData(optionalData);

  return {
    id: result.id,
    ...(presentOptionalData ? { optional: presentOptionalData } : {}),
    result: {
      findings: result.result.findings,
      schemaVersion: result.result.schemaVersion,
      summary: result.result.summary,
    },
  };
};

const formatFindingMarkdown = (finding: ReviewFinding, index: number): readonly string[] => [
  `### ${index + 1}. ${finding.title}`,
  `- Severity: ${finding.severity}`,
  `- Category: ${finding.category}`,
  `- Location: ${finding.filePath}, lines ${finding.startLine}-${finding.endLine}`,
  "",
  finding.description,
  "",
  `Next move: ${finding.suggestion}`,
];

export const formatReviewMarkdown = (
  result: ReviewResultResponse,
  optionalData?: ReviewOptionalResultData,
): string => {
  const payload = createReviewExportPayload(result, optionalData);
  const lines = [
    "# Review result",
    "",
    `Review id: ${payload.id}`,
    "",
    "## Summary",
    payload.result.summary,
    "",
  ];

  lines.push("## Findings", "");

  if (payload.result.findings.length === 0) {
    lines.push("No issue signals were supplied.");
  } else {
    payload.result.findings.forEach((finding, index) => {
      lines.push(...formatFindingMarkdown(finding, index), "");
    });
  }

  const optional = payload.optional;

  if (optional?.originalSource) {
    lines.push("## Original source", "", "```", optional.originalSource, "```", "");
  }

  if (optional?.improvedSource) {
    lines.push("## Improved source", "", "```", optional.improvedSource, "```", "");
  }

  if (optional?.improvedCode) {
    lines.push("## Improved code", "", "```", optional.improvedCode, "```", "");
  }

  if (optional?.diff) {
    lines.push("## Unified diff", "", "```diff", optional.diff, "```", "");
  }

  optional?.generatedTests?.forEach((generatedTest, index) => {
    lines.push(`## Generated test ${index + 1}`, "", "```", generatedTest, "```", "");
  });

  if (optional?.generatedTest) {
    lines.push("## Generated test", "", "```", optional.generatedTest, "```", "");
  }

  optional?.learningQuestions?.forEach((learningQuestion, index) => {
    lines.push(`## Learning question ${index + 1}`, "", learningQuestion, "");
  });

  if (optional?.learningQuestion) {
    lines.push("## Learning question", "", optional.learningQuestion, "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
};

export const formatReviewJson = (
  result: ReviewResultResponse,
  optionalData?: ReviewOptionalResultData,
): string => `${JSON.stringify(createReviewExportPayload(result, optionalData), null, 2)}\n`;
