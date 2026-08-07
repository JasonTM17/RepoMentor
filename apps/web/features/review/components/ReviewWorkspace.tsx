"use client";

import { useCallback, useMemo, useState } from "react";
import type { ChangeEvent, FC, FormEvent, ReactElement } from "react";

import LineIcon from "@/components/line-icon";
import ReviewResultPanel from "@/features/review/components/ReviewResultPanel";
import ReviewSourceEditor from "@/features/review/components/ReviewSourceEditor";
import {
  createInitialReviewDraft,
  estimateReviewMetrics,
  validateReviewDraft,
  validateReviewField,
} from "@/features/review/helpers/reviewHelpers";
import useReviewWorkspace from "@/features/review/hooks/useReviewWorkspace";
import type {
  LearnerLevel,
  ReviewDraft,
  ReviewFieldErrors,
  ReviewLanguage,
  ReviewMode,
  ReviewOptionalResultData,
  ReviewStatus,
  ReviewTextField,
  ReviewTransportFactory,
} from "@/features/review/types";

interface ReviewWorkspaceProps {
  readonly optionalData?: ReviewOptionalResultData | undefined;
  readonly transportFactory?: ReviewTransportFactory;
}

interface ValueTarget {
  readonly value: string;
}

const languageOptions: readonly { readonly label: string; readonly value: ReviewLanguage }[] = [
  { label: "JavaScript", value: "javascript" },
  { label: "TypeScript", value: "typescript" },
  { label: "Java", value: "java" },
  { label: "Python", value: "python" },
  { label: "Go", value: "go" },
  { label: "SQL", value: "sql" },
  { label: "C#", value: "csharp" },
  { label: "C++", value: "cpp" },
  { label: "Rust", value: "rust" },
  { label: "Other", value: "other" },
];

const learnerLevelOptions: readonly { readonly label: string; readonly value: LearnerLevel }[] = [
  { label: "Beginner", value: "beginner" },
  { label: "Intermediate", value: "intermediate" },
  { label: "Advanced", value: "advanced" },
];

const reviewModeOptions: readonly {
  readonly description: string;
  readonly label: string;
  readonly value: ReviewMode;
}[] = [
  { description: "A short pass for one focused change.", label: "Quick", value: "QUICK" },
  { description: "A balanced pass for teaching and review.", label: "Standard", value: "STANDARD" },
  { description: "A deeper pass with more reasoning context.", label: "Deep", value: "DEEP" },
];

const statusLabels: Record<ReviewStatus, string> = {
  empty: "Empty",
  error: "Error",
  idle: "Idle",
  loading: "Loading",
  processing: "Processing",
  success: "Success",
};

const statusCopy: Record<ReviewStatus, string> = {
  empty: "The run completed without issue signals.",
  error: "The transport returned an unavailable result.",
  idle: "Draft a review when you are ready.",
  loading: "Preparing the review request.",
  processing: "One bounded review run is in progress.",
  success: "Structured findings are ready to read.",
};

const fieldError = (
  field: ReviewTextField,
  errors: ReviewFieldErrors,
  touched: Record<ReviewTextField, boolean>,
): string | undefined => (touched[field] ? errors[field] : undefined);

const initialTouchedState = (): Record<ReviewTextField, boolean> => ({
  context: false,
  source: false,
  title: false,
});

const ReviewStatusRail: FC<{ readonly status: ReviewStatus }> = ({ status }): ReactElement => {
  const steps: readonly { readonly label: string; readonly state: "current" | "done" | "idle" }[] =
    [
      { label: "Draft", state: status === "idle" ? "current" : "done" },
      {
        label: "Process",
        state:
          status === "loading" || status === "processing"
            ? "current"
            : status === "success" || status === "empty"
              ? "done"
              : "idle",
      },
      {
        label: "Result",
        state:
          status === "success" || status === "empty" || status === "error" ? "current" : "idle",
      },
    ];

  return (
    <ol className="review-status-list" aria-label="Review run status">
      {steps.map((step, index) => (
        <li
          key={step.label}
          className={`review-status-step review-status-step-${step.state}`}
          aria-current={step.state === "current" ? "step" : undefined}
        >
          <span className="review-status-index" aria-hidden="true">
            0{index + 1}
          </span>
          <span className="review-status-step-copy">
            <strong>{step.label}</strong>
            <span>
              {step.state === "done"
                ? "Complete"
                : step.state === "current"
                  ? "Current"
                  : "Waiting"}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
};

const ReviewWorkspace: FC<ReviewWorkspaceProps> = ({
  optionalData,
  transportFactory,
}): ReactElement => {
  const [draft, setDraft] = useState<ReviewDraft>(createInitialReviewDraft);
  const [errors, setErrors] = useState<ReviewFieldErrors>({});
  const [touched, setTouched] = useState<Record<ReviewTextField, boolean>>(initialTouchedState);
  const { errorMessage, reset, result, retry, startReview, status } =
    useReviewWorkspace(transportFactory);
  const metrics = useMemo(() => estimateReviewMetrics(draft.source), [draft.source]);
  const isBusy = status === "loading" || status === "processing";
  const sourceError = fieldError("source", errors, touched);
  const titleError = fieldError("title", errors, touched);
  const contextError = fieldError("context", errors, touched);
  const sourceDescribedBy = sourceError
    ? "review-source-hint review-source-metrics review-source-error"
    : "review-source-hint review-source-metrics";

  const updateTextField = useCallback((field: ReviewTextField, value: string): void => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const updateLanguage = useCallback((event: ChangeEvent<HTMLSelectElement>): void => {
    setDraft((current) => ({
      ...current,
      language: (event.target as unknown as ValueTarget).value as ReviewLanguage,
    }));
  }, []);

  const updateLearnerLevel = useCallback((event: ChangeEvent<HTMLSelectElement>): void => {
    setDraft((current) => ({
      ...current,
      learnerLevel: (event.target as unknown as ValueTarget).value as LearnerLevel,
    }));
  }, []);

  const updateReviewMode = useCallback((event: ChangeEvent<HTMLSelectElement>): void => {
    setDraft((current) => ({
      ...current,
      mode: (event.target as unknown as ValueTarget).value as ReviewMode,
    }));
  }, []);

  const markFieldTouched = useCallback(
    (field: ReviewTextField): void => {
      setTouched((current) => ({ ...current, [field]: true }));
      setErrors((current) => ({
        ...current,
        [field]: validateReviewField(field, draft[field]),
      }));
    },
    [draft],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      const nextErrors = validateReviewDraft(draft);
      setTouched({ context: true, source: true, title: true });
      setErrors(nextErrors);

      if (Object.keys(nextErrors).length > 0) {
        return;
      }

      void startReview(draft);
    },
    [draft, startReview],
  );

  const handleReset = useCallback((): void => {
    if (isBusy) {
      reset();
      return;
    }

    const initialDraft = createInitialReviewDraft();
    setDraft(initialDraft);
    setErrors({});
    setTouched(initialTouchedState());
    reset();
  }, [isBusy, reset]);

  return (
    <main id="main-content" className="review-main shell-container">
      <header className="review-workspace-header">
        <div className="review-workspace-intro">
          <p className="section-kicker">Review workspace</p>
          <h1 className="review-workspace-title">Turn one code change into a lesson.</h1>
          <p className="review-workspace-lede">
            Paste a focused source excerpt, set the teaching context, and read the result beside the
            line that needs your attention.
          </p>
        </div>
        <div className="review-transport-chip" data-transport-mode="demo">
          <span className="status-label status-label-accent">Demo transport</span>
          <p>Deterministic fixture</p>
        </div>
      </header>

      <div className="review-workspace-grid">
        <section
          className="review-editor-panel surface-panel"
          aria-labelledby="review-editor-heading"
        >
          <header className="review-editor-header">
            <div>
              <p className="review-panel-kicker">New review</p>
              <h2 id="review-editor-heading" className="review-editor-title">
                Source and context
              </h2>
            </div>
            <span className="status-label">Local input</span>
          </header>

          <form className="review-form" noValidate onSubmit={handleSubmit}>
            <fieldset className="review-form-group">
              <legend className="review-form-legend">Review setup</legend>
              <div className="review-field-grid">
                <label className="review-field">
                  <span className="review-label">Language</span>
                  <select
                    className="review-input review-select"
                    value={draft.language}
                    onChange={updateLanguage}
                    disabled={isBusy}
                  >
                    {languageOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="review-field">
                  <span className="review-label">Learner level</span>
                  <select
                    className="review-input review-select"
                    value={draft.learnerLevel}
                    onChange={updateLearnerLevel}
                    disabled={isBusy}
                  >
                    {learnerLevelOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="review-field">
                  <span className="review-label">Review mode</span>
                  <select
                    className="review-input review-select"
                    value={draft.mode}
                    onChange={updateReviewMode}
                    disabled={isBusy}
                  >
                    {reviewModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className="review-field-hint">
                    {reviewModeOptions.find((option) => option.value === draft.mode)?.description}
                  </span>
                </label>
              </div>
            </fieldset>

            <fieldset className="review-form-group">
              <legend className="review-form-legend">Review context</legend>
              <label className="review-field">
                <span className="review-label-row">
                  <span className="review-label">Title</span>
                  <span className="review-optional">Optional</span>
                </span>
                <input
                  className={`review-input${titleError ? " review-input-error" : ""}`}
                  type="text"
                  name="title"
                  value={draft.title}
                  onChange={(event) =>
                    updateTextField("title", (event.target as unknown as ValueTarget).value)
                  }
                  onBlur={() => markFieldTouched("title")}
                  disabled={isBusy}
                  aria-invalid={titleError ? true : undefined}
                  aria-describedby={titleError ? "review-title-error" : undefined}
                />
                {titleError ? (
                  <span id="review-title-error" className="review-field-error" role="alert">
                    {titleError}
                  </span>
                ) : null}
              </label>

              <label className="review-field">
                <span className="review-label-row">
                  <span className="review-label">Context</span>
                  <span className="review-optional">Optional</span>
                </span>
                <textarea
                  className={`review-input review-context-input${contextError ? " review-input-error" : ""}`}
                  name="context"
                  rows={3}
                  value={draft.context}
                  onChange={(event) =>
                    updateTextField("context", (event.target as unknown as ValueTarget).value)
                  }
                  onBlur={() => markFieldTouched("context")}
                  disabled={isBusy}
                  aria-invalid={contextError ? true : undefined}
                  aria-describedby={contextError ? "review-context-error" : undefined}
                />
                {contextError ? (
                  <span id="review-context-error" className="review-field-error" role="alert">
                    {contextError}
                  </span>
                ) : null}
              </label>
            </fieldset>

            <fieldset className="review-form-group review-source-group">
              <legend className="review-form-legend">Source code</legend>
              <div className="review-field">
                <span className="review-label-row">
                  <span id="review-source-label" className="review-label">
                    Paste the focused change
                  </span>
                  <span className="review-required">Required</span>
                </span>
                <ReviewSourceEditor
                  describedBy={sourceDescribedBy}
                  disabled={isBusy}
                  invalid={Boolean(sourceError)}
                  labelId="review-source-label"
                  language={draft.language}
                  onBlur={() => markFieldTouched("source")}
                  onChange={(value) => updateTextField("source", value)}
                  value={draft.source}
                />
                <span id="review-source-hint" className="review-field-hint">
                  Keep the excerpt narrow enough that the review signal stays close to the changed
                  line.
                </span>
                <span
                  id="review-source-metrics"
                  className="review-source-metrics"
                  aria-live="polite"
                >
                  <span>{metrics.characterCount.toLocaleString()} characters</span>
                  <span aria-hidden="true">·</span>
                  <span>{metrics.lineCount.toLocaleString()} lines</span>
                  <span className="review-metrics-note">Local source counts</span>
                </span>
                {sourceError ? (
                  <span id="review-source-error" className="review-field-error" role="alert">
                    {sourceError}
                  </span>
                ) : null}
              </div>
            </fieldset>

            <div className="review-form-actions">
              <button
                className="action-primary review-submit"
                type="submit"
                aria-busy={isBusy}
                disabled={isBusy}
              >
                {isBusy
                  ? "Processing source"
                  : status === "error"
                    ? "Retry review"
                    : "Start demo review"}
                <LineIcon name={isBusy ? "arrow-right" : "arrow-up-right"} />
              </button>
              <button className="action-secondary" type="button" onClick={handleReset}>
                {isBusy ? "Cancel run" : "Reset draft"}
              </button>
            </div>

            <div id="review-transport-note" className="review-transport-note" role="note">
              <strong>Demo transport active.</strong>
              <p>
                This route uses a deterministic local fixture. It does not call live AI, save a
                review, or report usage. The service bridge is shaped for{" "}
                <code>POST /api/v1/reviews/:id/process</code> and{" "}
                <code>GET /api/v1/reviews/:id/result</code> after auth and review creation are
                wired.
              </p>
            </div>
          </form>
        </section>

        <aside className="review-sidebar" aria-labelledby="review-sidebar-heading">
          <section className="review-boundary-panel state-panel">
            <span className="status-label status-label-accent">Phase boundary</span>
            <h2 id="review-sidebar-heading" className="review-sidebar-title">
              Keep the review honest.
            </h2>
            <ul className="review-boundary-list">
              <li>Source, language, and mode match the accepted review transport shape.</li>
              <li>
                Title, context, and learner level guide this UI only until their server contract
                exists.
              </li>
              <li>The result reader accepts summary, findings, and safe execution metadata.</li>
            </ul>
          </section>

          <section
            className="review-status-panel surface-panel"
            aria-labelledby="review-status-heading"
          >
            <div className="review-status-heading">
              <div>
                <p className="review-panel-kicker">Run state</p>
                <h2 id="review-status-heading" className="review-sidebar-title">
                  {statusLabels[status]}
                </h2>
              </div>
              <span className="status-label">{statusLabels[status]}</span>
            </div>
            <p className="review-status-copy" aria-live="polite">
              {statusCopy[status]}
            </p>
            <ReviewStatusRail status={status} />
          </section>
        </aside>
      </div>

      <section className="review-results-region" aria-labelledby="review-results-region-heading">
        <h2 id="review-results-region-heading" className="visually-hidden">
          Review result
        </h2>
        <ReviewResultPanel
          errorMessage={errorMessage}
          language={draft.language}
          onRetry={retry}
          optionalData={optionalData}
          result={result}
          source={draft.source}
          status={status}
        />
      </section>
    </main>
  );
};

export default ReviewWorkspace;
