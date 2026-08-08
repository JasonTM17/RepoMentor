"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FC, ReactElement } from "react";
import { useParams } from "next/navigation";

import LineIcon from "@/components/line-icon";
import { getAccessToken } from "@/features/auth/api/authClient";
import { useAuthSession, useInitializeAuthSession } from "@/features/auth/authSession";
import { createDemoReviewDetailTransport } from "@/features/review/api/demoReviewTransport";
import { createReviewApiTransport } from "@/features/review/api/reviewApi";
import ReviewResultPanel from "@/features/review/components/ReviewResultPanel";
import type {
  ReviewDetail,
  ReviewDetailTransport,
  ReviewLanguage,
  ReviewResultResponse,
} from "@/features/review/types";

const maxReviewRouteIdLength = 256;
const reviewLanguages: readonly ReviewLanguage[] = [
  "javascript",
  "typescript",
  "java",
  "python",
  "go",
  "sql",
  "csharp",
  "cpp",
  "rust",
  "other",
];

type DetailViewStatus = "loading" | "error" | "processing" | "empty" | "result";
type DetailTransportMode = "api" | "demo" | "auth-required";

interface ReviewDetailViewState {
  readonly detail: ReviewDetail | null;
  readonly errorMessage: string | null;
  readonly result: ReviewResultResponse | null;
  readonly status: DetailViewStatus;
}

const initialState: ReviewDetailViewState = {
  detail: null,
  errorMessage: null,
  result: null,
  status: "loading",
};

const reviewUnavailableCopy = "This review is unavailable or you do not have access to it.";
const authRequiredCopy = "Sign in to reopen an authenticated review from your history.";

const isValidReviewRouteId = (value: string): boolean =>
  value.length > 0 &&
  value.length <= maxReviewRouteIdLength &&
  value === value.trim() &&
  /\S/u.test(value);

const isDemoReviewId = (value: string): boolean => value.startsWith("demo-");

const getReviewLanguage = (value: string): ReviewLanguage =>
  reviewLanguages.includes(value as ReviewLanguage) ? (value as ReviewLanguage) : "other";

const formatReviewStatus = (status: ReviewDetail["status"]): string =>
  status.charAt(0) + status.slice(1).toLowerCase();

const formatReviewDate = (value: string): string =>
  new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));

interface DetailStatePanelProps {
  readonly copy: string;
  readonly onRetry?: (() => void) | undefined;
  readonly status: Exclude<DetailViewStatus, "result">;
  readonly title: string;
}

const DetailStatePanel: FC<DetailStatePanelProps> = ({
  copy,
  onRetry,
  status,
  title,
}): ReactElement => {
  const isError = status === "error";
  const canRetry = onRetry !== undefined && (isError || status === "processing");

  return (
    <section
      className={`review-result-state state-panel review-result-state-${status}`}
      role={isError ? "alert" : "status"}
      aria-live="polite"
      aria-labelledby="review-detail-state-heading"
    >
      <div className="review-result-state-body">
        <span className="status-label">
          {status === "processing" ? "Processing" : status === "empty" ? "Empty result" : status}
        </span>
        <h2 id="review-detail-state-heading" className="review-result-state-title">
          {title}
        </h2>
        <p className="review-result-state-copy">{copy}</p>
        {status === "loading" || status === "processing" ? (
          <div className="review-result-skeletons" aria-hidden="true">
            <span className="review-result-skeleton review-result-skeleton-wide" />
            <span className="review-result-skeleton review-result-skeleton-medium" />
            <span className="review-result-skeleton review-result-skeleton-short" />
          </div>
        ) : null}
        {canRetry ? (
          <button className="action-secondary review-retry-button" type="button" onClick={onRetry}>
            {status === "processing" ? "Check for result" : "Retry read"}
            <LineIcon name="refresh" />
          </button>
        ) : null}
        {status === "empty" ? (
          <a className="usage-inline-link review-detail-history-link" href="/history">
            Return to history
            <LineIcon name="arrow-right" />
          </a>
        ) : null}
      </div>
    </section>
  );
};

const ReviewDetailMetadata: FC<{ readonly detail: ReviewDetail }> = ({ detail }): ReactElement => (
  <section
    className="review-detail-meta surface-panel"
    aria-labelledby="review-detail-meta-heading"
  >
    <header className="review-detail-meta-header">
      <div>
        <p className="review-panel-kicker">Owner-scoped record</p>
        <h2 id="review-detail-meta-heading" className="review-sidebar-title">
          Review context
        </h2>
      </div>
      <span className="status-label">{formatReviewStatus(detail.status)}</span>
    </header>
    <dl className="review-detail-meta-grid">
      <div>
        <dt>Review id</dt>
        <dd>{detail.id}</dd>
      </div>
      <div>
        <dt>Language</dt>
        <dd>{detail.language}</dd>
      </div>
      <div>
        <dt>Mode</dt>
        <dd>{detail.mode}</dd>
      </div>
      <div>
        <dt>Learner level</dt>
        <dd>{detail.learnerLevel}</dd>
      </div>
      <div>
        <dt>Created</dt>
        <dd>{formatReviewDate(detail.createdAt)}</dd>
      </div>
      <div>
        <dt>Updated</dt>
        <dd>{formatReviewDate(detail.updatedAt)}</dd>
      </div>
    </dl>
    {detail.context ? <p className="review-detail-context">{detail.context}</p> : null}
  </section>
);

const ReviewDetailPage = (): ReactElement => {
  useInitializeAuthSession();
  const { accessToken } = useAuthSession();
  const params = useParams<{ id: string }>();
  const routeId = params?.id;
  const reviewId = typeof routeId === "string" ? routeId : "";
  const isDemo = isDemoReviewId(reviewId);
  const transportMode: DetailTransportMode = isDemo
    ? "demo"
    : accessToken
      ? "api"
      : "auth-required";
  const [state, setState] = useState<ReviewDetailViewState>(initialState);
  const requestVersion = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const currentVersion = requestVersion.current + 1;
    requestVersion.current = currentVersion;
    setState({ ...initialState, status: "loading" });

    if (!isValidReviewRouteId(reviewId)) {
      setState({
        detail: null,
        errorMessage: reviewUnavailableCopy,
        result: null,
        status: "error",
      });
      return;
    }

    if (!isDemo && !accessToken) {
      setState({
        detail: null,
        errorMessage: authRequiredCopy,
        result: null,
        status: "error",
      });
      return;
    }

    const transport: ReviewDetailTransport = isDemo
      ? createDemoReviewDetailTransport(reviewId)
      : createReviewApiTransport({ getAccessToken });

    try {
      const detail = await transport.getDetail(reviewId);

      if (requestVersion.current !== currentVersion) {
        return;
      }

      if (detail.status !== "COMPLETED") {
        setState({
          detail,
          errorMessage: null,
          result: null,
          status:
            detail.status === "PENDING" || detail.status === "PROCESSING" ? "processing" : "empty",
        });
        return;
      }

      const result = await transport.getResult(detail.id);

      if (requestVersion.current !== currentVersion) {
        return;
      }

      setState({ detail, errorMessage: null, result, status: "result" });
    } catch {
      if (requestVersion.current !== currentVersion) {
        return;
      }

      setState({
        detail: null,
        errorMessage: reviewUnavailableCopy,
        result: null,
        status: "error",
      });
    }
  }, [accessToken, isDemo, reviewId]);

  useEffect(() => {
    void load();

    return () => {
      requestVersion.current += 1;
    };
  }, [load]);

  const retry = useCallback(async (): Promise<boolean> => {
    await load();
    return true;
  }, [load]);

  const resultStatus = useMemo(
    () => (state.result?.result.findings.length === 0 ? "empty" : "success"),
    [state.result],
  );
  const detailTitle = state.detail?.title ?? `Review ${reviewId || "detail"}`;
  const transportLabel =
    transportMode === "api"
      ? "Authenticated API"
      : transportMode === "demo"
        ? "Demo fixture"
        : "Sign-in required";
  const transportCopy =
    transportMode === "api"
      ? "Only the owner-scoped detail and result endpoints are read here."
      : transportMode === "demo"
        ? "This is a deterministic local fixture, clearly labelled and not persisted."
        : "An authenticated session is required before this route can read a saved review.";

  return (
    <main id="main-content" className="review-main shell-container">
      <header className="review-workspace-header">
        <div className="review-workspace-intro">
          <a className="usage-inline-link review-detail-history-link" href="/history">
            <LineIcon name="arrow-left" />
            Back to history
          </a>
          <p className="section-kicker">Review detail</p>
          <h1 className="review-workspace-title">{detailTitle}</h1>
          <p className="review-workspace-lede">
            Reopen the owner-scoped record and read its validated result without replaying the
            review run.
          </p>
        </div>
        <div className="review-transport-chip" data-transport-mode={transportMode}>
          <span className="status-label status-label-accent">{transportLabel}</span>
          <p>{transportCopy}</p>
        </div>
      </header>

      {state.detail ? <ReviewDetailMetadata detail={state.detail} /> : null}

      <section className="review-results-region" aria-labelledby="review-detail-result-heading">
        <h2 id="review-detail-result-heading" className="visually-hidden">
          Review result
        </h2>
        {state.status === "result" && state.detail && state.result ? (
          <ReviewResultPanel
            errorMessage={state.errorMessage}
            language={getReviewLanguage(state.detail.language)}
            onRetry={retry}
            result={state.result}
            source={state.detail.source}
            status={resultStatus}
            transportMode={transportMode === "api" ? "api" : "demo"}
          />
        ) : state.status === "loading" ? (
          <DetailStatePanel
            copy="Reading one owner-scoped review record and its validated result."
            status="loading"
            title="Preparing the review detail."
          />
        ) : state.status === "processing" ? (
          <DetailStatePanel
            copy="This review has no completed result yet. Check again when the server-owned run reaches a terminal state."
            onRetry={() => void load()}
            status="processing"
            title="The review is still processing."
          />
        ) : state.status === "empty" ? (
          <DetailStatePanel
            copy="This terminal review has no persisted result to display. The source and metadata remain owner-scoped."
            status="empty"
            title="No completed result is available."
          />
        ) : (
          <DetailStatePanel
            copy={state.errorMessage ?? reviewUnavailableCopy}
            onRetry={() => void load()}
            status="error"
            title="Review detail unavailable."
          />
        )}
      </section>
    </main>
  );
};

export default ReviewDetailPage;
