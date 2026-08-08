"use client";

import { useCallback, useMemo, useState } from "react";
import type { ChangeEvent, FC, ReactElement } from "react";

import LineIcon from "@/components/line-icon";
import UsagePageHeader from "@/features/usage/components/UsagePageHeader";
import UsageStatePanel from "@/features/usage/components/UsageStatePanel";
import useUsageHistory from "@/features/usage/hooks/useUsageHistory";
import useUsageTransport from "@/features/usage/hooks/useUsageTransport";
import {
  clampPage,
  createHistoryMeta,
  filterUsageHistory,
  formatCount,
  formatDateTime,
  formatDuration,
  formatEstimatedCost,
  formatLanguage,
  formatMode,
  formatPricingVersion,
  formatStatus,
  formatTokens,
} from "@/features/usage/helpers/usageHelpers";
import type {
  UsageHistoryFilters,
  UsageHistoryItem,
  UsageReviewMode,
  UsageReviewStatus,
  UsageTransport,
} from "@/features/usage/types";

const pageLimit = 4;
const statusOptions: readonly UsageReviewStatus[] = [
  "COMPLETED",
  "PROCESSING",
  "PENDING",
  "FAILED",
  "CANCELLED",
];
const modeOptions: readonly UsageReviewMode[] = ["QUICK", "STANDARD", "DEEP"];
const initialFilters: UsageHistoryFilters = Object.freeze({
  language: "ALL",
  mode: "ALL",
  status: "ALL",
});

interface UsageHistoryProps {
  readonly transport?: UsageTransport;
}

interface ValueTarget {
  readonly name: string;
  readonly value: string;
}

const isUsageReviewStatus = (value: string): value is UsageReviewStatus =>
  statusOptions.includes(value as UsageReviewStatus);

const isUsageReviewMode = (value: string): value is UsageReviewMode =>
  modeOptions.includes(value as UsageReviewMode);

const statusClassName = (status: UsageReviewStatus): string =>
  `usage-record-status usage-record-status-${status.toLowerCase()}`;

const reviewHref = (reviewId: string): string => `/reviews/${encodeURIComponent(reviewId)}`;

const ReviewReopenLink: FC<{ readonly reviewId: string }> = ({ reviewId }): ReactElement => (
  <a
    className="usage-history-review-link"
    href={reviewHref(reviewId)}
    aria-label={`Open review ${reviewId}`}
  >
    <span>{reviewId}</span>
    <LineIcon name="arrow-right" />
  </a>
);

const CostValue: FC<{ readonly item: UsageHistoryItem }> = ({ item }): ReactElement => (
  <span className="usage-history-cost">
    <strong>{formatEstimatedCost(item.estimatedCostMicros)}</strong>
    <small>
      {item.pricingVersion === null
        ? "No persisted estimate"
        : formatPricingVersion(item.pricingVersion)}
    </small>
  </span>
);

const HistoryRow: FC<{ readonly item: UsageHistoryItem }> = ({ item }): ReactElement => (
  <tr>
    <th scope="row" className="usage-history-review-id">
      <ReviewReopenLink reviewId={item.reviewId} />
    </th>
    <td>{formatLanguage(item.language)}</td>
    <td>{formatMode(item.mode)}</td>
    <td>
      <span className={statusClassName(item.status)}>{formatStatus(item.status)}</span>
    </td>
    <td className="usage-history-number">{formatTokens(item.totalTokens)}</td>
    <td className="usage-history-number">
      <CostValue item={item} />
    </td>
    <td>{formatDuration(item.durationMs)}</td>
    <td>{formatDateTime(item.createdAt)}</td>
  </tr>
);

const HistoryMobileItem: FC<{ readonly item: UsageHistoryItem }> = ({ item }): ReactElement => (
  <li className="usage-history-mobile-item">
    <header className="usage-history-mobile-header">
      <strong className="usage-history-review-id">
        <ReviewReopenLink reviewId={item.reviewId} />
      </strong>
      <span className={statusClassName(item.status)}>{formatStatus(item.status)}</span>
    </header>
    <dl className="usage-history-mobile-details">
      <div>
        <dt>Language</dt>
        <dd>{formatLanguage(item.language)}</dd>
      </div>
      <div>
        <dt>Mode</dt>
        <dd>{formatMode(item.mode)}</dd>
      </div>
      <div>
        <dt>Tokens</dt>
        <dd>{formatTokens(item.totalTokens)}</dd>
      </div>
      <div>
        <dt>Estimated cost</dt>
        <dd>
          <CostValue item={item} />
        </dd>
      </div>
      <div>
        <dt>Duration</dt>
        <dd>{formatDuration(item.durationMs)}</dd>
      </div>
      <div>
        <dt>Created</dt>
        <dd>{formatDateTime(item.createdAt)}</dd>
      </div>
    </dl>
  </li>
);

interface HistoryResultsProps {
  readonly items: readonly UsageHistoryItem[];
}

const HistoryResults: FC<HistoryResultsProps> = ({ items }): ReactElement => (
  <>
    <div className="usage-history-table-shell">
      <table className="usage-history-table">
        <caption className="visually-hidden">Source-free review history</caption>
        <thead>
          <tr>
            <th scope="col">Review</th>
            <th scope="col">Language</th>
            <th scope="col">Mode</th>
            <th scope="col">Status</th>
            <th scope="col">Tokens</th>
            <th scope="col">Estimated cost</th>
            <th scope="col">Duration</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <HistoryRow key={item.reviewId} item={item} />
          ))}
        </tbody>
      </table>
    </div>
    <ul className="usage-history-mobile-list" aria-label="Source-free review history">
      {items.map((item) => (
        <HistoryMobileItem key={item.reviewId} item={item} />
      ))}
    </ul>
  </>
);

interface FilterPanelProps {
  readonly disabled: boolean;
  readonly filters: UsageHistoryFilters;
  readonly languages: readonly string[];
  readonly onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}

const FilterPanel: FC<FilterPanelProps> = ({
  disabled,
  filters,
  languages,
  onChange,
}): ReactElement => (
  <section
    className="usage-history-filter-panel surface-panel"
    aria-labelledby="history-filter-heading"
  >
    <header className="usage-section-header">
      <div>
        <p className="usage-card-kicker">Demo-only filters</p>
        <h2 id="history-filter-heading" className="usage-section-title">
          Narrow the fixture rows.
        </h2>
      </div>
      <span className="status-label">Browser filter</span>
    </header>
    <div className="usage-history-filter-grid">
      <label className="usage-filter-field">
        <span>Status</span>
        <select
          className="usage-filter-input"
          disabled={disabled}
          name="status"
          value={filters.status}
          onChange={onChange}
        >
          <option value="ALL">All statuses</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {formatStatus(status)}
            </option>
          ))}
        </select>
      </label>
      <label className="usage-filter-field">
        <span>Mode</span>
        <select
          className="usage-filter-input"
          disabled={disabled}
          name="mode"
          value={filters.mode}
          onChange={onChange}
        >
          <option value="ALL">All modes</option>
          {modeOptions.map((mode) => (
            <option key={mode} value={mode}>
              {formatMode(mode)}
            </option>
          ))}
        </select>
      </label>
      <label className="usage-filter-field">
        <span>Language</span>
        <select
          className="usage-filter-input"
          disabled={disabled}
          name="language"
          value={filters.language}
          onChange={onChange}
        >
          <option value="ALL">All languages</option>
          {languages.map((language) => (
            <option key={language} value={language}>
              {formatLanguage(language)}
            </option>
          ))}
        </select>
      </label>
    </div>
    <p className="usage-history-boundary-note">
      The accepted server route supports page and limit only. Search, date filters, and sorting are
      not available in this phase.
    </p>
  </section>
);

interface PaginationProps {
  readonly disabled: boolean;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly page: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

const Pagination: FC<PaginationProps> = ({
  disabled,
  hasNext,
  hasPrevious,
  onNext,
  onPrevious,
  page,
  total,
  totalPages,
}): ReactElement => (
  <nav className="usage-pagination" aria-label="Review history pagination">
    <button
      className="action-secondary usage-pagination-button"
      type="button"
      disabled={disabled || !hasPrevious}
      onClick={onPrevious}
    >
      <LineIcon name="arrow-left" />
      Previous
    </button>
    <p className="usage-pagination-status" aria-live="polite">
      {totalPages === 0 ? "No records" : `Page ${page} of ${totalPages}`} / {formatCount(total)}{" "}
      records
    </p>
    <button
      className="action-secondary usage-pagination-button"
      type="button"
      disabled={disabled || !hasNext}
      onClick={onNext}
    >
      Next
      <LineIcon name="arrow-right" />
    </button>
  </nav>
);

const UsageHistory: FC<UsageHistoryProps> = ({ transport: transportOverride }): ReactElement => {
  const transport = useUsageTransport(transportOverride);
  const [filters, setFilters] = useState<UsageHistoryFilters>(initialFilters);
  const [page, setPage] = useState(1);
  const { data, errorMessage, retry, status } = useUsageHistory(page, pageLimit, transport);
  const supportsDemoFilters = transport.source === "demo" && transport.fixtureHistory !== undefined;
  const languages = useMemo(
    () =>
      [...new Set((transport.fixtureHistory ?? []).map((item) => item.language))].sort(
        (left, right) => left.localeCompare(right),
      ),
    [transport.fixtureHistory],
  );
  const filteredItems = useMemo(
    () =>
      supportsDemoFilters
        ? filterUsageHistory(transport.fixtureHistory ?? [], filters)
        : (data?.items ?? []),
    [data?.items, filters, supportsDemoFilters, transport.fixtureHistory],
  );
  const resolvedMeta =
    supportsDemoFilters && data
      ? createHistoryMeta(filteredItems.length, page, pageLimit)
      : (data?.meta ?? createHistoryMeta(0, 1, pageLimit));
  const visibleItems =
    supportsDemoFilters && data
      ? filteredItems.slice((page - 1) * pageLimit, page * pageLimit)
      : (data?.items ?? []);
  const hasActiveFilters =
    filters.status !== "ALL" || filters.mode !== "ALL" || filters.language !== "ALL";
  const paginationDisabled = status === "loading" || data === null;

  const handleFilterChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>): void => {
      const target = event.target as unknown as ValueTarget;
      const { name, value } = target;

      setPage(1);
      setFilters((current) => {
        if (name === "status" && (value === "ALL" || isUsageReviewStatus(target.value))) {
          return { ...current, status: value as UsageHistoryFilters["status"] };
        }

        if (name === "mode" && (value === "ALL" || isUsageReviewMode(target.value))) {
          return { ...current, mode: value as UsageHistoryFilters["mode"] };
        }

        if (name === "language" && (value === "ALL" || languages.includes(value))) {
          return { ...current, language: value };
        }

        return current;
      });
    },
    [languages],
  );

  const clearFilters = useCallback((): void => {
    setFilters(initialFilters);
    setPage(1);
  }, []);

  const handlePrevious = useCallback((): void => {
    setPage((current) => clampPage(current - 1, resolvedMeta.totalPages));
  }, [resolvedMeta.totalPages]);

  const handleNext = useCallback((): void => {
    setPage((current) => clampPage(current + 1, resolvedMeta.totalPages));
  }, [resolvedMeta.totalPages]);

  const results =
    status === "loading" ? (
      <UsageStatePanel
        copy="Reading one bounded page of source-free review records."
        title="Preparing history"
        tone="loading"
      />
    ) : status === "error" || data === null ? (
      <UsageStatePanel
        actionLabel="Retry read"
        copy={errorMessage ?? "History data could not be read from the selected boundary."}
        onAction={retry}
        title="History read unavailable"
        tone="error"
      />
    ) : visibleItems.length === 0 ? (
      <section className="usage-history-empty state-panel" role="status">
        <p className="usage-card-kicker">Empty result</p>
        <h2 className="usage-state-title">
          {hasActiveFilters ? "No fixture rows match these filters." : "No review activity yet."}
        </h2>
        <p className="usage-state-copy">
          {hasActiveFilters
            ? "Clear one or more demo-only filters to return to the full deterministic history."
            : "The authenticated history contract is ready, but this web route is still using its visible fixture boundary."}
        </p>
        {hasActiveFilters ? (
          <button
            className="action-secondary usage-state-action"
            type="button"
            onClick={clearFilters}
          >
            Clear filters
            <LineIcon name="refresh" />
          </button>
        ) : null}
      </section>
    ) : (
      <>
        <HistoryResults items={visibleItems} />
        <Pagination
          disabled={paginationDisabled}
          hasNext={resolvedMeta.hasNext}
          hasPrevious={resolvedMeta.hasPrevious}
          onNext={handleNext}
          onPrevious={handlePrevious}
          page={resolvedMeta.totalPages === 0 ? 1 : resolvedMeta.page}
          total={resolvedMeta.total}
          totalPages={resolvedMeta.totalPages}
        />
      </>
    );

  return (
    <main id="main-content" className="usage-main shell-container">
      <UsagePageHeader
        description="Review records stay readable at a glance, with token and configured cost fields shown only when the accepted response contains them."
        kicker="History"
        source={transport.source}
        title="Trace the review desk, row by row."
      />
      {supportsDemoFilters ? (
        <FilterPanel
          disabled={status === "loading"}
          filters={filters}
          languages={languages}
          onChange={handleFilterChange}
        />
      ) : (
        <section
          className="usage-history-filter-panel surface-panel"
          aria-labelledby="history-boundary-heading"
        >
          <p className="usage-card-kicker">API boundary</p>
          <h2 id="history-boundary-heading" className="usage-section-title">
            Page and limit are the available controls.
          </h2>
          <p className="usage-history-boundary-note">
            Server-side search, date filtering, sorting, and browser-side fixture filters are not
            active for this source.
          </p>
        </section>
      )}
      <section className="usage-history-results" aria-labelledby="history-results-heading">
        <header className="usage-section-header">
          <div>
            <p className="usage-card-kicker">Source-free records</p>
            <h2 id="history-results-heading" className="usage-section-title">
              Review activity
            </h2>
          </div>
          {supportsDemoFilters ? (
            <span className="status-label">
              Fixture total {formatCount(transport.fixtureHistory?.length ?? 0)}
            </span>
          ) : null}
        </header>
        {results}
      </section>
    </main>
  );
};

export default UsageHistory;
