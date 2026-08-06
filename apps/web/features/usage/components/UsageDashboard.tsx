"use client";

import type { FC, ReactElement } from "react";

import LineIcon from "@/components/line-icon";
import UsagePageHeader from "@/features/usage/components/UsagePageHeader";
import UsageStatePanel from "@/features/usage/components/UsageStatePanel";
import { createDemoUsageTransport } from "@/features/usage/api/demoUsageTransport";
import useUsageDashboard from "@/features/usage/hooks/useUsageDashboard";
import {
  formatCount,
  formatDateTime,
  formatLanguage,
  formatMode,
  formatStatus,
  formatTokens,
} from "@/features/usage/helpers/usageHelpers";
import type {
  UsageDashboardData,
  UsageHistoryItem,
  UsageReviewMode,
  UsageReviewStatus,
  UsageTransport,
} from "@/features/usage/types";

const demoTransport = createDemoUsageTransport();
const quotaModes: readonly UsageReviewMode[] = ["QUICK", "STANDARD", "DEEP"];
const statusModes: readonly UsageReviewStatus[] = [
  "COMPLETED",
  "PROCESSING",
  "PENDING",
  "FAILED",
  "CANCELLED",
];

interface UsageDashboardProps {
  readonly transport?: UsageTransport;
}

interface MetricCardProps {
  readonly label: string;
  readonly note: string;
  readonly value: string;
}

const MetricCard: FC<MetricCardProps> = ({ label, note, value }): ReactElement => (
  <article className="usage-metric surface-panel">
    <p className="usage-metric-label">{label}</p>
    <p className="usage-metric-value">{value}</p>
    <p className="usage-metric-note">{note}</p>
  </article>
);

interface ActivityRowProps {
  readonly item: UsageHistoryItem;
}

const ActivityRow: FC<ActivityRowProps> = ({ item }): ReactElement => (
  <li className="usage-activity-row">
    <div className="usage-activity-main">
      <strong className="usage-activity-id">{item.reviewId}</strong>
      <span className="usage-activity-detail">
        {formatLanguage(item.language)} / {formatMode(item.mode)} / {formatDateTime(item.createdAt)}
      </span>
    </div>
    <span className={`usage-record-status usage-record-status-${item.status.toLowerCase()}`}>
      {formatStatus(item.status)}
    </span>
    <span className="usage-activity-tokens">{formatTokens(item.totalTokens)} tokens</span>
  </li>
);

interface QuotaCardProps {
  readonly mode: UsageReviewMode;
  readonly remaining: number;
  readonly limit: number;
  readonly used: number;
}

const QuotaCard: FC<QuotaCardProps> = ({ limit, mode, remaining, used }): ReactElement => {
  const percentage = limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));

  return (
    <article className="usage-quota-card">
      <header className="usage-quota-header">
        <div>
          <p className="usage-card-kicker">Review mode</p>
          <h3 className="usage-card-title">{formatMode(mode)}</h3>
        </div>
        <span className="usage-quota-remaining">{formatCount(remaining)} left</span>
      </header>
      <div
        className="usage-quota-rail"
        role="progressbar"
        aria-label={`${formatMode(mode)} quota used`}
        aria-valuemax={limit}
        aria-valuemin={0}
        aria-valuenow={used}
      >
        <span style={{ width: `${percentage}%` }} />
      </div>
      <dl className="usage-quota-stats">
        <div>
          <dt>Used</dt>
          <dd>{formatCount(used)}</dd>
        </div>
        <div>
          <dt>Limit</dt>
          <dd>{formatCount(limit)}</dd>
        </div>
        <div>
          <dt>Remaining</dt>
          <dd>{formatCount(remaining)}</dd>
        </div>
      </dl>
    </article>
  );
};

const EmptyPanel: FC<{ readonly copy: string; readonly title: string }> = ({ copy, title }) => (
  <div className="usage-empty-panel" role="status">
    <p className="usage-card-kicker">No data in this view</p>
    <h3 className="usage-card-title">{title}</h3>
    <p>{copy}</p>
  </div>
);

interface DashboardContentProps {
  readonly data: UsageDashboardData;
}

const DashboardContent: FC<DashboardContentProps> = ({ data }): ReactElement => {
  const { history, quota, summary } = data;
  const maxLanguageCount = Math.max(
    1,
    ...summary.languageDistribution.map((language) => language.count),
  );

  return (
    <>
      <section className="usage-metric-grid" aria-label="Review overview">
        <MetricCard
          label="Total reviews"
          note="Owned review records in the summary shape"
          value={formatCount(summary.totalReviews)}
        />
        <MetricCard
          label="Completed reviews"
          note="Completed status count"
          value={formatCount(summary.completedReviews)}
        />
        <MetricCard
          label="Deep reviews"
          note="Deep mode count across review statuses"
          value={formatCount(summary.deepReviews)}
        />
        <MetricCard
          label="Total tokens"
          note="Input plus output on completed results"
          value={formatCount(summary.totalTokens)}
        />
      </section>

      <section className="usage-ledger-panel surface-panel" aria-labelledby="usage-ledger-heading">
        <header className="usage-section-header">
          <div>
            <p className="usage-card-kicker">Token ledger</p>
            <h2 id="usage-ledger-heading" className="usage-section-title">
              Measured work, separated by direction.
            </h2>
          </div>
          <span className="status-label">Summary fields only</span>
        </header>
        <dl className="usage-ledger-grid">
          <div>
            <dt>Input tokens</dt>
            <dd>{formatCount(summary.inputTokens)}</dd>
          </div>
          <div>
            <dt>Output tokens</dt>
            <dd>{formatCount(summary.outputTokens)}</dd>
          </div>
          <div>
            <dt>Total tokens</dt>
            <dd>{formatCount(summary.totalTokens)}</dd>
          </div>
        </dl>
        <p className="usage-panel-note">
          The accepted summary contract reports token totals and review counts. It does not report
          cost, model spend, or reasoning measurements.
        </p>
      </section>

      <div className="usage-dashboard-columns">
        <section
          className="usage-activity-panel surface-panel"
          aria-labelledby="usage-activity-heading"
        >
          <header className="usage-section-header">
            <div>
              <p className="usage-card-kicker">Recent activity</p>
              <h2 id="usage-activity-heading" className="usage-section-title">
                The latest review records.
              </h2>
            </div>
            <a className="usage-inline-link" href="/history">
              Full history
              <LineIcon name="arrow-up-right" />
            </a>
          </header>
          {history.items.length > 0 ? (
            <ol className="usage-activity-list">
              {history.items.map((item) => (
                <ActivityRow key={item.reviewId} item={item} />
              ))}
            </ol>
          ) : (
            <EmptyPanel
              copy="No review records are available in this summary window."
              title="No reviews yet"
            />
          )}
        </section>

        <section
          className="usage-language-panel surface-panel"
          aria-labelledby="usage-language-heading"
        >
          <header className="usage-section-header">
            <div>
              <p className="usage-card-kicker">Language distribution</p>
              <h2 id="usage-language-heading" className="usage-section-title">
                Where the review desk is used.
              </h2>
            </div>
          </header>
          {summary.languageDistribution.length > 0 ? (
            <ul className="usage-language-list">
              {summary.languageDistribution.map((language) => (
                <li key={language.language} className="usage-language-row">
                  <div className="usage-language-label-row">
                    <span>{formatLanguage(language.language)}</span>
                    <strong>{formatCount(language.count)}</strong>
                  </div>
                  <div className="usage-language-rail" aria-hidden="true">
                    <span style={{ width: `${(language.count / maxLanguageCount) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyPanel
              copy="Language counts appear after review records exist."
              title="No language mix yet"
            />
          )}
        </section>
      </div>

      <section className="usage-quota-section" aria-labelledby="usage-quota-heading">
        <header className="usage-section-header usage-section-header-wide">
          <div>
            <p className="usage-card-kicker">UTC day quota</p>
            <h2 id="usage-quota-heading" className="usage-section-title">
              Keep today&apos;s run budget visible.
            </h2>
            <p className="usage-section-copy">
              Quota counts are configuration-driven review counts for {quota.utcDay}. They are not
              token budgets.
            </p>
          </div>
          <span className="status-label">As of {formatDateTime(quota.asOf)} UTC</span>
        </header>
        <div className="usage-quota-grid">
          {quotaModes.map((mode) => (
            <QuotaCard key={mode} mode={mode} {...quota.modes[mode]} />
          ))}
        </div>
      </section>

      <section className="usage-status-panel surface-panel" aria-labelledby="usage-status-heading">
        <header className="usage-section-header">
          <div>
            <p className="usage-card-kicker">Status ledger</p>
            <h2 id="usage-status-heading" className="usage-section-title">
              Every review state stays explicit.
            </h2>
          </div>
        </header>
        <dl className="usage-status-grid">
          {statusModes.map((status) => (
            <div
              key={status}
              className={`usage-status-item usage-status-item-${status.toLowerCase()}`}
            >
              <dt>{formatStatus(status)}</dt>
              <dd>{formatCount(summary.reviewsByStatus[status])}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
};

const UsageDashboard: FC<UsageDashboardProps> = ({ transport = demoTransport }): ReactElement => {
  const { data, errorMessage, retry, status } = useUsageDashboard(transport);

  const body =
    status === "loading" ? (
      <UsageStatePanel
        copy="Reading the summary, latest history page, and daily quota boundary."
        title="Preparing the usage desk"
        tone="loading"
      />
    ) : status === "error" || data === null ? (
      <UsageStatePanel
        actionLabel="Retry read"
        copy={errorMessage ?? "Usage data could not be read from the selected boundary."}
        onAction={retry}
        title="Usage read unavailable"
        tone="error"
      />
    ) : (
      <DashboardContent data={data} />
    );

  return (
    <main id="main-content" className="usage-main shell-container">
      <UsagePageHeader
        description="A bounded review ledger for activity, tokens, language mix, and daily run limits."
        kicker="Dashboard"
        source={transport.source}
        title="See the review work without inventing a story."
      />
      {body}
      <p className="usage-snapshot-note">
        Snapshot field: {transport.source === "demo" ? "fixed fixture" : "API asOf"}.
      </p>
    </main>
  );
};

export default UsageDashboard;
