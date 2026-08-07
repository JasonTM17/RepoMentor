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

const ReviewOptionalResultViews: FC<ReviewOptionalResultViewsProps> = ({
  language,
  optionalData,
  source,
}): ReactElement => {
  const improvedCode = optionalText(optionalData?.improvedCode);
  const generatedTest = optionalText(optionalData?.generatedTest);
  const learningQuestion = optionalText(optionalData?.learningQuestion);
  const improvedSource = optionalText(optionalData?.improvedSource) ?? improvedCode;
  const originalSource = optionalText(optionalData?.originalSource) ?? source;
  const hasDiff = Boolean(improvedSource);

  return (
    <section className="review-optional-views" aria-labelledby="review-optional-heading">
      <div className="review-section-heading">
        <div>
          <h3 id="review-optional-heading" className="review-subtitle">
            Review extensions
          </h3>
          <p className="review-section-copy">
            These views render only when the result supplies the corresponding optional data.
          </p>
        </div>
        <span className="status-label">Optional result data</span>
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
            Generated test
          </h4>
          {generatedTest ? (
            <pre className="review-optional-code" aria-label="Generated test case">
              <code>{generatedTest}</code>
            </pre>
          ) : (
            <OptionalUnavailable copy="No generated test case was included in this result." />
          )}
        </section>

        <section
          className="review-optional-panel"
          aria-labelledby="review-learning-question-heading"
        >
          <h4 id="review-learning-question-heading" className="review-optional-title">
            Learning question
          </h4>
          {learningQuestion ? (
            <p className="review-learning-question">{learningQuestion}</p>
          ) : (
            <OptionalUnavailable copy="No learning question was included in this result." />
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
              The comparison editor is available only when improved source data is supplied.
            </p>
          </div>
          <span className="status-label">Optional diff</span>
        </div>
        {hasDiff ? (
          <ReviewDiffEditor
            describedBy="review-diff-note"
            language={language}
            modified={improvedSource ?? ""}
            original={originalSource}
          />
        ) : (
          <OptionalUnavailable copy="An original and improved source pair is not available." />
        )}
      </section>
    </section>
  );
};

export default ReviewOptionalResultViews;
