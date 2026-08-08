"use client";

import type { FC, ReactElement } from "react";

import { ReviewDiffEditor } from "@/features/review/components/ReviewSourceEditor";
import type { ReviewLanguage, ReviewOptionalResultData } from "@/features/review/types";

interface ReviewOptionalResultViewsProps {
  readonly language: ReviewLanguage;
  readonly optionalData?: ReviewOptionalResultData | undefined;
  readonly source: string;
}

const OptionalUnavailable: FC<{ readonly copy: string }> = ({ copy }): ReactElement => (
  <div className="review-optional-state state-panel">
    <span className="status-label">Not supplied</span>
    <p>{copy}</p>
  </div>
);

const optionalText = (value: string | undefined): string | undefined =>
  value?.trim() ? value : undefined;

const optionalTexts = (values: readonly string[] | undefined): string[] =>
  (values ?? []).map(optionalText).filter((value): value is string => value !== undefined);

const ReviewOptionalResultViews: FC<ReviewOptionalResultViewsProps> = ({
  language,
  optionalData,
  source,
}): ReactElement => {
  const improvedCode = optionalText(optionalData?.improvedCode);
  const improvedSource = optionalText(optionalData?.improvedSource) ?? improvedCode;
  const legacyGeneratedTest = optionalText(optionalData?.generatedTest);
  const legacyLearningQuestion = optionalText(optionalData?.learningQuestion);
  const generatedTests = [
    ...optionalTexts(optionalData?.generatedTests),
    ...(legacyGeneratedTest ? [legacyGeneratedTest] : []),
  ];
  const learningQuestions = [
    ...optionalTexts(optionalData?.learningQuestions),
    ...(legacyLearningQuestion ? [legacyLearningQuestion] : []),
  ];
  const diff = optionalText(optionalData?.diff);
  const originalSource = optionalText(optionalData?.originalSource) ?? source;
  const hasComparison = Boolean(improvedSource);

  return (
    <section className="review-optional-views" aria-labelledby="review-optional-heading">
      <div className="review-section-heading">
        <div>
          <h3 id="review-optional-heading" className="review-subtitle">
            Review extensions
          </h3>
          <p className="review-section-copy">
            These views render the validated education payload when the result supplies it.
          </p>
        </div>
        <span className="status-label">Education payload</span>
      </div>

      <div className="review-optional-grid">
        <section className="review-optional-panel" aria-labelledby="review-improved-code-heading">
          <h4 id="review-improved-code-heading" className="review-optional-title">
            Improved code
          </h4>
          {improvedCode ? (
            <pre className="review-optional-code" aria-label="Improved code">
              <code>{improvedCode}</code>
            </pre>
          ) : (
            <OptionalUnavailable copy="No improved code was included in this result." />
          )}
        </section>

        <section className="review-optional-panel" aria-labelledby="review-generated-test-heading">
          <h4 id="review-generated-test-heading" className="review-optional-title">
            Generated tests
          </h4>
          {generatedTests.length > 0 ? (
            <ol className="review-optional-list">
              {generatedTests.map((test, index) => (
                <li key={`${test.slice(0, 32)}-${index}`}>
                  <pre className="review-optional-code" aria-label={`Generated test ${index + 1}`}>
                    <code>{test}</code>
                  </pre>
                </li>
              ))}
            </ol>
          ) : (
            <OptionalUnavailable copy="No generated test cases were included in this result." />
          )}
        </section>

        <section
          className="review-optional-panel"
          aria-labelledby="review-learning-question-heading"
        >
          <h4 id="review-learning-question-heading" className="review-optional-title">
            Learning questions
          </h4>
          {learningQuestions.length > 0 ? (
            <ol className="review-learning-list">
              {learningQuestions.map((question, index) => (
                <li key={`${question.slice(0, 32)}-${index}`}>
                  <p className="review-learning-question">{question}</p>
                </li>
              ))}
            </ol>
          ) : (
            <OptionalUnavailable copy="No learning questions were included in this result." />
          )}
        </section>
      </div>

      <section className="review-diff-panel" aria-labelledby="review-diff-heading">
        <div className="review-section-heading">
          <div>
            <h4 id="review-diff-heading" className="review-optional-title">
              Original versus improved
            </h4>
            <p id="review-diff-note" className="review-section-copy">
              The validated result may include a unified diff and a side-by-side source comparison.
            </p>
          </div>
          <span className="status-label">Diff and comparison</span>
        </div>
        {diff ? (
          <pre className="review-optional-code review-optional-diff" aria-label="Unified diff">
            <code>{diff}</code>
          </pre>
        ) : null}
        {hasComparison ? (
          <ReviewDiffEditor
            describedBy="review-diff-note"
            language={language}
            modified={improvedSource ?? ""}
            original={originalSource}
          />
        ) : !diff ? (
          <OptionalUnavailable copy="An original and improved source pair is not available." />
        ) : null}
      </section>
    </section>
  );
};

export default ReviewOptionalResultViews;
