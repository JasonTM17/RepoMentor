"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, ReactElement } from "react";

import LineIcon from "@/components/line-icon";
import { getAccessToken } from "@/features/auth/api/authClient";
import { useAuthSession, useInitializeAuthSession } from "@/features/auth/authSession";
import {
  createReviewHistoryApiTransport,
  ReviewHistoryApiError,
} from "@/features/history/api/reviewHistoryApi";
import type {
  ReviewHistoryData,
  ReviewHistoryItem,
  ReviewHistoryMode,
  ReviewHistoryRequest,
  ReviewHistorySort,
  ReviewHistoryStatus,
} from "@/features/history/types";
import UsageStatePanel from "@/features/usage/components/UsageStatePanel";

const pageLimit = 20;
const languagePattern = /^[a-z0-9#+._-]+$/u;
const initialFilters: HistoryFilterDraft = Object.freeze({
  language: "",
  mode: "ALL",
  sort: "desc",
  status: "ALL",
  title: "",
});
const modeOptions: readonly ReviewHistoryMode[] = ["QUICK", "STANDARD", "DEEP"];
const statusOptions: readonly ReviewHistoryStatus[] = [
  "COMPLETED",
  "PROCESSING",
  "PENDING",
  "FAILED",
  "CANCELLED",
];

type FilterMode = ReviewHistoryMode | "ALL";
type FilterStatus = ReviewHistoryStatus | "ALL";

interface HistoryFilterDraft {
  readonly language: string;
  readonly mode: FilterMode;
  readonly sort: ReviewHistorySort;
  readonly status: FilterStatus;
  readonly title: string;
}

type ReadStatus = "error" | "loading" | "success";
type DeleteStatus = "confirming" | "error" | "idle" | "working";

const getFieldValue = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>): string =>
  (event.target as unknown as { readonly value: string }).value;

const formatLabel = (value: string): string => value.charAt(0) + value.slice(1).toLowerCase();

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));

const reviewTitle = (item: ReviewHistoryItem): string => item.title ?? "Untitled review";

const reviewLink = (reviewId: string): string => `/reviews/${encodeURIComponent(reviewId)}`;

const statusClassName = (status: ReviewHistoryStatus): string =>
  `usage-record-status usage-record-status-${status.toLowerCase()}`;

const toRequest = (filters: HistoryFilterDraft, page: number): ReviewHistoryRequest => ({
  ...(filters.language ? { language: filters.language } : {}),
  ...(filters.mode === "ALL" ? {} : { mode: filters.mode }),
  ...(filters.status === "ALL" ? {} : { status: filters.status }),
  ...(filters.title ? { title: filters.title } : {}),
  limit: pageLimit,
  page,
  sort: filters.sort,
});

const getErrorCopy = (error: unknown): string => {
  if (error instanceof ReviewHistoryApiError && (error.status === 401 || error.status === 403)) {
    return "Your session is no longer authorized. Sign in again, then retry the history request.";
  }

  if (error instanceof ReviewHistoryApiError && error.status === 0) {
    return "The history API could not be reached. Check the API boundary, then retry the request.";
  }

  return "The authenticated review history could not be read from the accepted API contract.";
};

const HistoryPageHeader = (): ReactElement => (
  <header className="usage-page-header">
    <div className="usage-page-intro">
      <p className="section-kicker">History</p>
      <h1 className="usage-page-title">Trace every review, row by row.</h1>
      <p className="usage-page-description">
        Search your owner-scoped review records, reopen a detail view, or soft-delete selected
        records without exposing source code in the history shell.
      </p>
    </div>
    <aside className="usage-source-note" data-transport-mode="api">
      <span className="status-label status-label-accent">API seam</span>
      <p>
        Authenticated review-history requests use the accepted filters and soft-delete contract.
      </p>
    </aside>
  </header>
);

interface HistoryFilterPanelProps {
  readonly disabled: boolean;
  readonly draft: HistoryFilterDraft;
  readonly errorMessage: string | null;
  readonly onClear: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly setDraft: (next: (current: HistoryFilterDraft) => HistoryFilterDraft) => void;
}

const HistoryFilterPanel = ({
  disabled,
  draft,
  errorMessage,
  onClear,
  onSubmit,
  setDraft,
}: HistoryFilterPanelProps): ReactElement => (
  <section className="history-filter-panel surface-panel" aria-labelledby="history-filter-heading">
    <header className="usage-section-header">
      <div>
        <p className="usage-card-kicker">Server-side controls</p>
        <h2 id="history-filter-heading" className="usage-section-title">
          Find the review you need.
        </h2>
      </div>
      <span className="status-label">20 per page</span>
    </header>
    <form onSubmit={onSubmit}>
      <div className="history-filter-grid">
        <label className="usage-filter-field">
          <span>Title</span>
          <input
            className="usage-filter-input"
            disabled={disabled}
            maxLength={80}
            name="title"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setDraft((current) => ({ ...current, title: getFieldValue(event) }))
            }
            placeholder="Search title"
            type="search"
            value={draft.title}
          />
        </label>
        <label className="usage-filter-field">
          <span>Language</span>
          <input
            className="usage-filter-input"
            disabled={disabled}
            maxLength={32}
            name="language"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setDraft((current) => ({ ...current, language: getFieldValue(event) }))
            }
            placeholder="typescript"
            type="text"
            value={draft.language}
          />
        </label>
        <label className="usage-filter-field">
          <span>Mode</span>
          <select
            className="usage-filter-input"
            disabled={disabled}
            name="mode"
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setDraft((current) => ({ ...current, mode: getFieldValue(event) as FilterMode }))
            }
            value={draft.mode}
          >
            <option value="ALL">All modes</option>
            {modeOptions.map((mode) => (
              <option key={mode} value={mode}>
                {formatLabel(mode)}
              </option>
            ))}
          </select>
        </label>
        <label className="usage-filter-field">
          <span>Status</span>
          <select
            className="usage-filter-input"
            disabled={disabled}
            name="status"
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setDraft((current) => ({
                ...current,
                status: getFieldValue(event) as FilterStatus,
              }))
            }
            value={draft.status}
          >
            <option value="ALL">All statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {formatLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="usage-filter-field">
          <span>Order</span>
          <select
            className="usage-filter-input"
            disabled={disabled}
            name="sort"
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setDraft((current) => ({
                ...current,
                sort: getFieldValue(event) as ReviewHistorySort,
              }))
            }
            value={draft.sort}
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </label>
      </div>
      <p className="history-filter-note">
        Search and ordering stay on the API boundary. Only metadata is shown here; review source is
        never returned by this list contract.
      </p>
      {errorMessage ? (
        <p className="history-inline-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <div className="history-filter-actions">
        <button className="action-primary" disabled={disabled} type="submit">
          Apply filters
          <LineIcon name="arrow-right" />
        </button>
        <button className="action-secondary" disabled={disabled} onClick={onClear} type="button">
          Clear filters
          <LineIcon name="refresh" />
        </button>
      </div>
    </form>
  </section>
);

interface HistoryResultsProps {
  readonly data: ReviewHistoryData;
  readonly disabled: boolean;
  readonly onSelect: (reviewId: string) => void;
  readonly onSelectAll: () => void;
  readonly onRequestDelete: () => void;
  readonly selectedIds: ReadonlySet<string>;
}

const HistoryResults = ({
  data,
  disabled,
  onRequestDelete,
  onSelect,
  onSelectAll,
  selectedIds,
}: HistoryResultsProps): ReactElement => {
  const allSelected = data.items.length > 0 && data.items.every((item) => selectedIds.has(item.id));

  return (
    <>
      <div className="history-results-toolbar">
        <p className="history-results-count" aria-live="polite">
          {data.meta.total} {data.meta.total === 1 ? "review" : "reviews"}
        </p>
        {selectedIds.size > 0 ? (
          <button
            className="action-secondary history-delete-button"
            disabled={disabled}
            onClick={onRequestDelete}
            type="button"
          >
            Delete selected ({selectedIds.size})
          </button>
        ) : null}
      </div>
      <div className="history-table-shell">
        <table className="history-table">
          <caption className="visually-hidden">Owner-scoped review history</caption>
          <thead>
            <tr>
              <th scope="col">
                <input
                  aria-label="Select all reviews on this page"
                  checked={allSelected}
                  disabled={disabled || data.items.length === 0}
                  onChange={onSelectAll}
                  type="checkbox"
                />
              </th>
              <th scope="col">Review</th>
              <th scope="col">Language</th>
              <th scope="col">Mode</th>
              <th scope="col">Status</th>
              <th scope="col">Created</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    aria-label={`Select ${reviewTitle(item)}`}
                    checked={selectedIds.has(item.id)}
                    disabled={disabled}
                    onChange={() => onSelect(item.id)}
                    type="checkbox"
                  />
                </td>
                <th scope="row" className="history-review-cell">
                  <a className="history-review-link" href={reviewLink(item.id)}>
                    <strong>{reviewTitle(item)}</strong>
                    <span>{item.id}</span>
                    <LineIcon name="arrow-right" />
                  </a>
                </th>
                <td>{item.language}</td>
                <td>{formatLabel(item.mode)}</td>
                <td>
                  <span className={statusClassName(item.status)}>{formatLabel(item.status)}</span>
                </td>
                <td>{formatDate(item.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="history-mobile-list" aria-label="Owner-scoped review history">
        {data.items.map((item) => (
          <li className="history-mobile-item" key={item.id}>
            <header className="history-mobile-header">
              <label className="history-mobile-select">
                <input
                  aria-label={`Select ${reviewTitle(item)}`}
                  checked={selectedIds.has(item.id)}
                  disabled={disabled}
                  onChange={() => onSelect(item.id)}
                  type="checkbox"
                />
                <span>Select</span>
              </label>
              <span className={statusClassName(item.status)}>{formatLabel(item.status)}</span>
            </header>
            <a className="history-review-link history-mobile-link" href={reviewLink(item.id)}>
              <strong>{reviewTitle(item)}</strong>
              <span>{item.id}</span>
              <LineIcon name="arrow-right" />
            </a>
            <dl className="history-mobile-details">
              <div>
                <dt>Language</dt>
                <dd>{item.language}</dd>
              </div>
              <div>
                <dt>Mode</dt>
                <dd>{formatLabel(item.mode)}</dd>
              </div>
              <div>
                <dt>Learner level</dt>
                <dd>{formatLabel(item.learnerLevel)}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(item.createdAt)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
};

interface HistoryPaginationProps {
  readonly disabled: boolean;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly page: number;
  readonly totalPages: number;
}

const HistoryPagination = ({
  disabled,
  onNext,
  onPrevious,
  page,
  totalPages,
}: HistoryPaginationProps): ReactElement => (
  <nav className="history-pagination" aria-label="Review history pagination">
    <button
      className="action-secondary history-pagination-button"
      disabled={disabled || page <= 1 || totalPages === 0}
      onClick={onPrevious}
      type="button"
    >
      <LineIcon name="arrow-left" />
      Previous
    </button>
    <p aria-live="polite">{totalPages === 0 ? "No records" : `Page ${page} of ${totalPages}`}</p>
    <button
      className="action-secondary history-pagination-button"
      disabled={disabled || page >= totalPages || totalPages === 0}
      onClick={onNext}
      type="button"
    >
      Next
      <LineIcon name="arrow-right" />
    </button>
  </nav>
);

interface DeleteConfirmationProps {
  readonly count: number;
  readonly disabled: boolean;
  readonly errorMessage: string | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

const DeleteConfirmation = ({
  count,
  disabled,
  errorMessage,
  onCancel,
  onConfirm,
}: DeleteConfirmationProps): ReactElement => (
  <section
    className="history-confirm-panel state-panel"
    aria-describedby="history-confirm-copy"
    aria-labelledby="history-confirm-heading"
    role="alertdialog"
  >
    <p className="usage-card-kicker">Soft delete</p>
    <h3 id="history-confirm-heading" className="history-confirm-title">
      Remove {count} selected {count === 1 ? "review" : "reviews"}?
    </h3>
    <p id="history-confirm-copy" className="history-confirm-copy">
      The API will hide these owner-scoped records. Their source is not sent by this action, and
      this operation cannot be undone from the history view.
    </p>
    {errorMessage ? (
      <p className="history-inline-error" role="alert">
        {errorMessage}
      </p>
    ) : null}
    <div className="history-confirm-actions">
      <button className="action-secondary" disabled={disabled} onClick={onCancel} type="button">
        Keep records
      </button>
      <button className="action-primary" disabled={disabled} onClick={onConfirm} type="button">
        {disabled ? "Deleting..." : "Delete selected"}
      </button>
    </div>
  </section>
);

const HistoryWorkspace = (): ReactElement => {
  useInitializeAuthSession();
  const { accessToken } = useAuthSession();
  const [draft, setDraftState] = useState<HistoryFilterDraft>(initialFilters);
  const [filters, setFilters] = useState<HistoryFilterDraft>(initialFilters);
  const [page, setPage] = useState(1);
  const [requestVersion, setRequestVersion] = useState(0);
  const [data, setData] = useState<ReviewHistoryData | null>(null);
  const [readStatus, setReadStatus] = useState<ReadStatus>("loading");
  const [readError, setReadError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus>("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const request = useMemo(() => toRequest(filters, page), [filters, page]);

  const setDraft = useCallback(
    (next: (current: HistoryFilterDraft) => HistoryFilterDraft): void => {
      setDraftState(next);
    },
    [],
  );

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let isCurrent = true;
    setReadStatus("loading");
    setReadError(null);
    setNotice(null);

    void createReviewHistoryApiTransport({ getAccessToken })
      .list(request)
      .then((nextData) => {
        if (!isCurrent) {
          return;
        }

        setData(nextData);
        setReadStatus("success");
        setSelectedIds(new Set());
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return;
        }

        setData(null);
        setReadStatus("error");
        setReadError(getErrorCopy(error));
      });

    return () => {
      isCurrent = false;
    };
  }, [accessToken, request, requestVersion]);

  const updateSelection = useCallback((reviewId: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(reviewId)) {
        next.delete(reviewId);
      } else {
        next.add(reviewId);
      }

      return next;
    });
  }, []);

  const selectAll = useCallback((): void => {
    setSelectedIds((current) => {
      const pageIds = data?.items.map((item) => item.id) ?? [];
      const allSelected = pageIds.length > 0 && pageIds.every((id) => current.has(id));
      const next = new Set(current);

      pageIds.forEach((id) => {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      });

      return next;
    });
  }, [data?.items]);

  const applyFilters = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      const language = draft.language.trim().toLowerCase();

      if (language && !languagePattern.test(language)) {
        setReadError(
          "Language may contain only letters, numbers, +, #, dots, underscores, or hyphens.",
        );
        return;
      }

      setReadError(null);
      setFilters({
        ...draft,
        language,
        title: draft.title.trim(),
      });
      setPage(1);
      setSelectedIds(new Set());
      setNotice(null);
    },
    [draft],
  );

  const clearFilters = useCallback((): void => {
    setDraftState(initialFilters);
    setFilters(initialFilters);
    setPage(1);
    setSelectedIds(new Set());
    setNotice(null);
    setReadError(null);
  }, []);

  const openDeleteConfirmation = useCallback((): void => {
    setDeleteError(null);
    setDeleteStatus("confirming");
  }, []);

  const confirmDelete = useCallback(async (): Promise<void> => {
    const ids = [...selectedIds];

    if (ids.length === 0) {
      setDeleteStatus("idle");
      return;
    }

    setDeleteStatus("working");
    setDeleteError(null);

    try {
      const result = await createReviewHistoryApiTransport({ getAccessToken }).deleteMany(ids);
      setDeleteStatus("idle");
      setSelectedIds(new Set());
      setNotice(
        result.deletedCount === 1
          ? "One review was removed from your history."
          : `${result.deletedCount} reviews were removed from your history.`,
      );

      if (data?.items.length === 1 && page > 1) {
        setPage((current) => current - 1);
      } else {
        setRequestVersion((current) => current + 1);
      }
    } catch (error: unknown) {
      setDeleteStatus("error");
      setDeleteError(getErrorCopy(error));
    }
  }, [data?.items.length, page, selectedIds]);

  const goPrevious = useCallback((): void => {
    setPage((current) => Math.max(1, current - 1));
    setSelectedIds(new Set());
  }, []);

  const goNext = useCallback((): void => {
    setPage((current) =>
      data?.meta.totalPages ? Math.min(data.meta.totalPages, current + 1) : current,
    );
    setSelectedIds(new Set());
  }, [data?.meta.totalPages]);

  const hasActiveFilters = Boolean(
    filters.title ||
    filters.language ||
    filters.mode !== "ALL" ||
    filters.status !== "ALL" ||
    filters.sort !== "desc",
  );

  if (!accessToken) {
    return (
      <main id="main-content" className="usage-main history-main shell-container">
        <HistoryPageHeader />
        <section className="history-auth-panel state-panel" aria-live="polite" role="status">
          <p className="usage-card-kicker">Authenticated boundary</p>
          <h2 className="usage-state-title">Sign in to view your review history.</h2>
          <p className="usage-state-copy">
            Review history is owner-scoped. Sign in to read records from the API and reopen a review
            detail without falling back to fixture data.
          </p>
          <div className="history-auth-actions">
            <a className="action-primary" href="/login">
              Sign in
              <LineIcon name="arrow-right" />
            </a>
          </div>
        </section>
      </main>
    );
  }

  const isBusy = readStatus === "loading" || deleteStatus === "working";
  const result =
    readStatus === "loading" ? (
      <UsageStatePanel
        copy="Reading one bounded page of owner-scoped review records."
        title="Preparing history"
        tone="loading"
      />
    ) : readStatus === "error" || data === null ? (
      <UsageStatePanel
        actionLabel="Retry read"
        copy={readError ?? "History data could not be read from the selected boundary."}
        onAction={() => setRequestVersion((current) => current + 1)}
        title="History read unavailable"
        tone="error"
      />
    ) : data.items.length === 0 ? (
      <section className="history-empty state-panel" role="status">
        <p className="usage-card-kicker">Empty result</p>
        <h2 className="usage-state-title">
          {hasActiveFilters ? "No reviews match these filters." : "No review activity yet."}
        </h2>
        <p className="usage-state-copy">
          {hasActiveFilters
            ? "Clear one or more filters to return to the full owner-scoped history."
            : "Create an authenticated review to see its metadata here."}
        </p>
        {hasActiveFilters ? (
          <button
            className="action-secondary usage-state-action"
            onClick={clearFilters}
            type="button"
          >
            Clear filters
            <LineIcon name="refresh" />
          </button>
        ) : null}
      </section>
    ) : (
      <>
        <HistoryResults
          data={data}
          disabled={isBusy}
          onRequestDelete={openDeleteConfirmation}
          onSelect={updateSelection}
          onSelectAll={selectAll}
          selectedIds={selectedIds}
        />
        <HistoryPagination
          disabled={isBusy}
          onNext={goNext}
          onPrevious={goPrevious}
          page={data.meta.page}
          totalPages={data.meta.totalPages}
        />
      </>
    );

  return (
    <main id="main-content" className="usage-main history-main shell-container">
      <HistoryPageHeader />
      <HistoryFilterPanel
        disabled={isBusy}
        draft={draft}
        errorMessage={readError && readStatus !== "error" ? readError : null}
        onClear={clearFilters}
        onSubmit={applyFilters}
        setDraft={setDraft}
      />
      <section className="usage-history-results" aria-labelledby="history-results-heading">
        <header className="usage-section-header">
          <div>
            <p className="usage-card-kicker">Owner-scoped records</p>
            <h2 id="history-results-heading" className="usage-section-title">
              Review activity
            </h2>
          </div>
          <span className="status-label">Server data</span>
        </header>
        {notice ? (
          <p className="history-notice" aria-live="polite" role="status">
            {notice}
          </p>
        ) : null}
        {deleteStatus === "confirming" || deleteStatus === "working" || deleteStatus === "error" ? (
          <DeleteConfirmation
            count={selectedIds.size}
            disabled={deleteStatus === "working"}
            errorMessage={deleteError}
            onCancel={() => setDeleteStatus("idle")}
            onConfirm={() => void confirmDelete()}
          />
        ) : null}
        {result}
      </section>
    </main>
  );
};

export default HistoryWorkspace;
