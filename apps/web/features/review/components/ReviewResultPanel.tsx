"use client";

import { useCallback, useMemo, useState } from "react";
import type { ChangeEvent, FC, ReactElement } from "react";

import LineIcon from "@/components/line-icon";
import type {
  ReviewCategory,
  ReviewFinding,
  ReviewResultResponse,
  ReviewSeverity,
  ReviewStatus,
} from "@/features/review/types";

interface ReviewResultPanelProps {
  readonly errorMessage: string | null;
  readonly onRetry: () => Promise<boolean>;
  readonly result: ReviewResultResponse | null;
  readonly source: string;
  readonly status: ReviewStatus;
}

type FindingFilter = ReviewSeverity | "ALL";
type CategoryFilter = ReviewCategory | "ALL";
type CopyState = "idle" | "copied" | "failed";

interface ValueTarget {
  readonly value: string;
}

interface ClipboardLike {
  readonly writeText: (value: string) => Promise<void>;
}

interface NavigatorWithOptionalClipboard {
  readonly clipboard?: ClipboardLike;
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

const formatFindingText = (finding: ReviewFinding): string =>
  `${finding.severity} ${finding.category}: ${finding.title}\n${finding.description}\nNext move: ${finding.suggestion}`;

const ReviewStatePanel: FC<ReviewResultPanelProps> = ({ errorMessage, onRetry, status }) => {
  const isError = status === "error";
  const isBusy = status === "loading" || status === "processing";
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
        {isError ? (
          <button
            className="action-secondary review-retry-button"
            type="button"
            onClick={() => void onRetry()}
          >
            Retry review
            <LineIcon name="refresh" />
          </button>
        ) : null}
      </div>
    </section>
  );
};

const ReviewSourceContext: FC<{
  readonly findings: readonly ReviewFinding[];
  readonly source: string;
}> = ({ findings, source }): ReactElement => {
  const sourceLines = source.split(/\r?\n/u).slice(0, 24);

  return (
    <section className="review-source-context" aria-labelledby="review-source-heading">
      <div className="review-section-heading">
        <div>
          <h3 id="review-source-heading" className="review-subtitle">
            Source context
          </h3>
          <p className="review-section-copy">
            Line references below come from the structured result.
          </p>
        </div>
        <span className="status-label">First 24 lines</span>
      </div>
      <pre className="review-code-context" aria-label="Reviewed source context">
        <code>
          {sourceLines.map((line, index) => {
            const lineNumber = index + 1;
            const isHighlighted = findings.some(
              (finding) => lineNumber >= finding.startLine && lineNumber <= finding.endLine,
            );

            return (
              <span
                key={lineNumber}
                className={`review-code-context-line${isHighlighted ? " review-code-context-line-active" : ""}`}
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
      {sourceLines.length < source.split(/\r?\n/u).length ? (
        <p className="review-section-note">
          Showing the first 24 lines to keep the result readable.
        </p>
      ) : null}
    </section>
  );
};

const ReviewFindingView: FC<{ readonly finding: ReviewFinding }> = ({ finding }): ReactElement => (
  <li className="review-finding">
    <div className="review-finding-header">
      <span className={`review-severity review-severity-${finding.severity.toLowerCase()}`}>
        {finding.severity}
      </span>
      <span className="review-finding-category">{finding.category}</span>
      <span className="review-finding-location">
        {finding.filePath} / {formatLineReference(finding)}
      </span>
    </div>
    <h4 className="review-finding-title">{finding.title}</h4>
    <p className="review-finding-copy">{finding.description}</p>
    <section className="review-learning-note" aria-labelledby={`learning-${finding.startLine}`}>
      <p id={`learning-${finding.startLine}`} className="review-learning-heading">
        <LineIcon name="book-open" />
        Learning note
      </p>
      <p className="review-learning-copy">{finding.suggestion}</p>
    </section>
  </li>
);

const ReviewResultPanel: FC<ReviewResultPanelProps> = ({
  errorMessage,
  onRetry,
  result,
  source,
  status,
}): ReactElement => {
  const [severityFilter, setSeverityFilter] = useState<FindingFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const findings = result?.result.findings ?? [];
  const filteredFindings = useMemo(
    () =>
      findings.filter(
        (finding) =>
          (severityFilter === "ALL" || finding.severity === severityFilter) &&
          (categoryFilter === "ALL" || finding.category === categoryFilter),
      ),
    [categoryFilter, findings, severityFilter],
  );

  const copyResult = useCallback(async (): Promise<void> => {
    const clipboard = (globalThis.navigator as unknown as NavigatorWithOptionalClipboard).clipboard;

    if (!result || !clipboard) {
      setCopyState("failed");
      return;
    }

    const content = [result.result.summary, ...findings.map(formatFindingText)].join("\n\n");

    try {
      await clipboard.writeText(content);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }, [findings, result]);

  if (status !== "success" && status !== "empty") {
    return (
      <ReviewStatePanel
        errorMessage={errorMessage}
        onRetry={onRetry}
        result={result}
        source={source}
        status={status}
      />
    );
  }

  if (!result) {
    return (
      <ReviewStatePanel
        errorMessage={null}
        onRetry={onRetry}
        result={result}
        source={source}
        status="idle"
      />
    );
  }

  const resultTitle =
    status === "empty" ? "No issue signals returned." : "The structured result is ready.";
  const copyLabel =
    copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy unavailable" : "Copy result";
  const durationLabel =
    result.execution.durationMs > 0 ? `${result.execution.durationMs} ms` : "Not recorded in demo";

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
        <div className="review-result-actions">
          <span className="review-result-id">Review id: {result.id}</span>
          <button
            className="action-secondary review-copy-button"
            type="button"
            onClick={() => void copyResult()}
          >
            {copyLabel}
          </button>
        </div>

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
            <dl className="review-summary-metrics">
              <div>
                <dt>Signals</dt>
                <dd>{findings.length}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>Completed</dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="review-source-result-grid">
          <ReviewSourceContext findings={findings} source={source} />

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
                {filteredFindings.map((finding) => (
                  <ReviewFindingView
                    key={`${finding.filePath}-${finding.startLine}-${finding.title}`}
                    finding={finding}
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

        <section className="review-execution-panel" aria-labelledby="review-execution-heading">
          <div className="review-section-heading">
            <div>
              <h3 id="review-execution-heading" className="review-subtitle">
                Transport metadata
              </h3>
              <p className="review-section-copy">
                The fixture mirrors the safe execution fields the API can return.
              </p>
            </div>
            <span className="status-label">No live usage</span>
          </div>
          <dl className="review-execution-grid">
            <div>
              <dt>Provider</dt>
              <dd>{result.execution.provider}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{result.execution.model}</dd>
            </div>
            <div>
              <dt>Reasoning</dt>
              <dd>{result.execution.reasoningEffort}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{durationLabel}</dd>
            </div>
          </dl>
          <p className="review-section-note">
            Demo metadata is static and does not claim a provider call, quota, or token usage.
          </p>
        </section>
      </div>
    </section>
  );
};

export default ReviewResultPanel;
