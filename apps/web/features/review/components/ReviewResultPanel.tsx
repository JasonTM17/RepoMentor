"use client";

import { useCallback, useMemo, useState } from "react";
import type { ChangeEvent, FC, ReactElement } from "react";

import LineIcon from "@/components/line-icon";
import ReviewOptionalResultViews from "@/features/review/components/ReviewOptionalResultViews";
import ReviewResultActions from "@/features/review/components/ReviewResultActions";
import type {
  ReviewCategory,
  ReviewFinding,
  ReviewLanguage,
  ReviewOptionalResultData,
  ReviewResultResponse,
  ReviewSeverity,
  ReviewStatus,
} from "@/features/review/types";

interface ReviewResultPanelProps {
  readonly errorMessage: string | null;
  readonly language: ReviewLanguage;
  readonly onRetry: () => Promise<boolean>;
  readonly optionalData?: ReviewOptionalResultData | undefined;
  readonly result: ReviewResultResponse | null;
  readonly source: string;
  readonly status: ReviewStatus;
}

type FindingFilter = ReviewSeverity | "ALL";
type CategoryFilter = ReviewCategory | "ALL";

interface ValueTarget {
  readonly value: string;
}

const severityOptions: readonly FindingFilter[] = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"];
const categoryOptions: readonly CategoryFilter[] = [
  "ALL",
  "BUG",
  "SECURITY",
  "PERFORMANCE",
  "MAINTAINABILITY",
  "STYLE",
];

const formatFilterLabel = (value: string): string =>
  value === "ALL" ? "All signals" : value.charAt(0) + value.slice(1).toLowerCase();

const formatLineReference = (finding: ReviewFinding): string =>
  finding.startLine === finding.endLine
    ? `Line ${finding.startLine}`
    : `Lines ${finding.startLine}-${finding.endLine}`;

interface ReviewStatePanelProps {
  readonly errorMessage: string | null;
  readonly onRetry: () => Promise<boolean>;
  readonly status: ReviewStatus;
}

const ReviewStatePanel: FC<ReviewStatePanelProps> = ({ errorMessage, onRetry, status }) => {
  const isError = status === "error";
  const isBusy = status === "loading" || status === "processing";
  const isProcessing = status === "processing";
  const title =
    status === "idle"
      ? "Result will land here."
      : status === "loading"
        ? "Checking the review input."
        : status === "processing"
          ? "Processing the source."
          : "The review could not finish.";
  const copy =
    status === "idle"
      ? "Start a demo review to see the structured summary, issue signals, and learning notes in this panel."
      : status === "loading"
        ? "The workspace is preparing the transport request. The editor stays in place while the state changes."
        : status === "processing"
          ? "The transport is processing one bounded review run. No progress percentage or usage value is invented here."
          : (errorMessage ?? "Try the review again from the same draft.");

  return (
    <section
      className={`review-result-state state-panel review-result-state-${status}`}
      role={isError ? "alert" : "status"}
      aria-live="polite"
      aria-labelledby="review-result-state-heading"
    >
      <div className="review-result-state-body">
        <span className="status-label">
          {status === "idle" ? "Idle" : status === "error" ? "Error" : status}
        </span>
        <h2 id="review-result-state-heading" className="review-result-state-title">
          {title}
        </h2>
        <p className="review-result-state-copy">{copy}</p>
        {isBusy ? (
          <div className="review-result-skeletons" aria-hidden="true">
            <span className="review-result-skeleton review-result-skeleton-wide" />
            <span className="review-result-skeleton review-result-skeleton-medium" />
            <span className="review-result-skeleton review-result-skeleton-short" />
          </div>
        ) : null}
        {isError || isProcessing ? (
          <button
            className="action-secondary review-retry-button"
            type="button"
            onClick={() => void onRetry()}
          >
            {isProcessing ? "Check for result" : "Retry review"}
            <LineIcon name="refresh" />
          </button>
        ) : null}
      </div>
    </section>
  );
};

const ReviewSourceContext: FC<{
  readonly findings: readonly ReviewFinding[];
  readonly selectedFinding: ReviewFinding | null;
  readonly source: string;
}> = ({ findings, selectedFinding, source }): ReactElement => {
  const allSourceLines = source.split(/\r?\n/u);
  const selectedLine = selectedFinding?.startLine ?? 1;
  const visibleStart = selectedFinding
    ? Math.max(0, Math.min(selectedLine - 1, Math.max(0, allSourceLines.length - 24)))
    : 0;
  const sourceLines = allSourceLines.slice(visibleStart, visibleStart + 24);
  const visibleEnd = visibleStart + sourceLines.length;
  const selectionCopy = selectedFinding
    ? `${formatLineReference(selectedFinding)} selected in the source context.`
    : "Select an issue signal to focus its referenced source lines.";

  return (
    <section
      id="review-source-context"
      className="review-source-context"
      aria-labelledby="review-source-heading"
    >
      <div className="review-section-heading">
        <div>
          <h3 id="review-source-heading" className="review-subtitle">
            Source context
          </h3>
          <p className="review-section-copy">
            Line references below come from the structured result.
          </p>
        </div>
        <span className="status-label">
          Lines {visibleStart + 1} to {visibleEnd}
        </span>
      </div>
      <p
        id="review-source-selection-status"
        className="visually-hidden"
        role="status"
        aria-live="polite"
      >
        {selectionCopy}
      </p>
      <pre className="review-code-context" aria-label="Reviewed source context">
        <code>
          {sourceLines.map((line, index) => {
            const lineNumber = visibleStart + index + 1;
            const isSelected = selectedFinding
              ? lineNumber >= selectedFinding.startLine && lineNumber <= selectedFinding.endLine
              : false;
            const isReferenced = findings.some(
              (finding) => lineNumber >= finding.startLine && lineNumber <= finding.endLine,
            );

            return (
              <span
                key={lineNumber}
                className={`review-code-context-line${isReferenced ? " review-code-context-line-active" : ""}${isSelected ? " review-code-context-line-selected" : ""}`}
              >
                <span className="review-code-context-number" aria-hidden="true">
                  {lineNumber}
                </span>
                <span className="review-code-context-text">{line || " "}</span>
              </span>
            );
          })}
        </code>
      </pre>
      {sourceLines.length < allSourceLines.length ? (
        <p className="review-section-note">
          Showing a 24-line window to keep the result readable. Selecting an issue moves the window
          to its referenced line.
        </p>
      ) : null}
    </section>
  );
};

const ReviewFindingView: FC<{
  readonly finding: ReviewFinding;
  readonly findingIndex: number;
  readonly isSelected: boolean;
  readonly onSelect: (findingIndex: number) => void;
}> = ({ finding, findingIndex, isSelected, onSelect }): ReactElement => {
  const learningNoteId = `learning-note-${findingIndex}`;

  return (
    <li className="review-finding">
      <div className="review-finding-header">
        <span className={`review-severity review-severity-${finding.severity.toLowerCase()}`}>
          {finding.severity}
        </span>
        <span className="review-finding-category">{finding.category}</span>
        <button
          className="review-finding-location review-finding-jump"
          type="button"
          aria-controls="review-source-context"
          aria-pressed={isSelected}
          onClick={() => onSelect(findingIndex)}
        >
          <span>
            {finding.filePath} / {formatLineReference(finding)}
          </span>
          <LineIcon name="arrow-right" />
        </button>
      </div>
      <h4 className="review-finding-title">{finding.title}</h4>
      <p className="review-finding-copy">{finding.description}</p>
      <section className="review-learning-note" aria-labelledby={learningNoteId}>
        <p id={learningNoteId} className="review-learning-heading">
          <LineIcon name="book-open" />
          Learning note
        </p>
        <p className="review-learning-copy">{finding.suggestion}</p>
      </section>
    </li>
  );
};

const ReviewResultPanel: FC<ReviewResultPanelProps> = ({
  errorMessage,
  language,
  onRetry,
  optionalData,
  result,
  source,
  status,
}): ReactElement => {
  const [severityFilter, setSeverityFilter] = useState<FindingFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [selectedFindingIndex, setSelectedFindingIndex] = useState<number | null>(null);
  const findings = result?.result.findings ?? [];
  const filteredFindings = useMemo(
    () =>
      findings
        .map((finding, findingIndex) => ({ finding, findingIndex }))
        .filter(
          ({ finding }) =>
            (severityFilter === "ALL" || finding.severity === severityFilter) &&
            (categoryFilter === "ALL" || finding.category === categoryFilter),
        ),
    [categoryFilter, findings, severityFilter],
  );
  const selectedFinding =
    selectedFindingIndex === null ? null : (findings[selectedFindingIndex] ?? null);
  const selectedFindingIsVisible = filteredFindings.some(
    ({ findingIndex }) => findingIndex === selectedFindingIndex,
  );
  const visibleSelectedFinding = selectedFindingIsVisible ? selectedFinding : null;
  const selectFinding = useCallback((findingIndex: number): void => {
    setSelectedFindingIndex(findingIndex);
  }, []);

  if (status !== "success" && status !== "empty") {
    return <ReviewStatePanel errorMessage={errorMessage} onRetry={onRetry} status={status} />;
  }

  if (!result) {
    return <ReviewStatePanel errorMessage={null} onRetry={onRetry} status="idle" />;
  }

  const resultTitle =
    status === "empty" ? "No issue signals returned." : "The structured result is ready.";

  return (
    <section
      className="review-results-panel surface-panel"
      aria-labelledby="review-results-heading"
    >
      <header className="review-results-header">
        <div>
          <p className="review-panel-kicker">Structured result</p>
          <h2 id="review-results-heading" className="review-results-title">
            {resultTitle}
          </h2>
          <p className="review-results-copy">
            This view maps the result shape returned by the review transport. The visible content is
            a deterministic fixture in this phase.
          </p>
        </div>
        <span className="status-label status-label-accent">Demo fixture</span>
      </header>

      <div className="review-results-body">
        <ReviewResultActions optionalData={optionalData} result={result} />

        <div className="review-result-grid">
          <section className="review-score-panel" aria-labelledby="review-score-heading">
            <p className="review-panel-kicker">Result signal</p>
            <h3 id="review-score-heading" className="review-subtitle">
              Score
            </h3>
            <p className="review-score-value">Not supplied</p>
            <p className="review-score-copy">
              The current transport returns a summary and finding list. No score is invented for
              this surface.
            </p>
          </section>

          <section className="review-summary-panel" aria-labelledby="review-summary-heading">
            <h3 id="review-summary-heading" className="review-subtitle">
              Summary
            </h3>
            <p className="review-summary-copy">{result.result.summary}</p>
          </section>
        </div>

        <div className="review-source-result-grid">
          <ReviewSourceContext
            findings={findings}
            selectedFinding={visibleSelectedFinding}
            source={source}
          />

          <section className="review-issues-section" aria-labelledby="review-issues-heading">
            <div className="review-section-heading">
              <div>
                <h3 id="review-issues-heading" className="review-subtitle">
                  Issue signals
                </h3>
                <p className="review-section-copy">
                  {findings.length === 0
                    ? "The fixture completed with an empty finding list."
                    : "Each signal keeps its issue explanation beside the next learning move."}
                </p>
              </div>
              <span className="status-label">{filteredFindings.length} shown</span>
            </div>

            {findings.length > 0 ? (
              <div className="review-filters" aria-label="Filter issue signals">
                <label className="review-filter-field">
                  <span>Severity</span>
                  <select
                    className="review-input review-select"
                    value={severityFilter}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setSeverityFilter(
                        (event.target as unknown as ValueTarget).value as FindingFilter,
                      )
                    }
                  >
                    {severityOptions.map((option) => (
                      <option key={option} value={option}>
                        {formatFilterLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="review-filter-field">
                  <span>Category</span>
                  <select
                    className="review-input review-select"
                    value={categoryFilter}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setCategoryFilter(
                        (event.target as unknown as ValueTarget).value as CategoryFilter,
                      )
                    }
                  >
                    {categoryOptions.map((option) => (
                      <option key={option} value={option}>
                        {formatFilterLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {filteredFindings.length > 0 ? (
              <ul className="review-finding-list">
                {filteredFindings.map(({ finding, findingIndex }) => (
                  <ReviewFindingView
                    key={`${finding.filePath}-${finding.startLine}-${finding.endLine}-${findingIndex}`}
                    finding={finding}
                    findingIndex={findingIndex}
                    isSelected={findingIndex === selectedFindingIndex}
                    onSelect={selectFinding}
                  />
                ))}
              </ul>
            ) : (
              <div className="review-empty-findings state-panel">
                <span className="status-label">Empty result</span>
                <p>No issue signals are available for the selected filters.</p>
              </div>
            )}
          </section>
        </div>

        <ReviewOptionalResultViews
          language={language}
          optionalData={optionalData}
          source={source}
        />
      </div>
    </section>
  );
};

export default ReviewResultPanel;
