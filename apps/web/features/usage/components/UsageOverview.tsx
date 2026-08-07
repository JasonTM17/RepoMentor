"use client";

import type { FC, ReactElement } from "react";

import LineIcon from "@/components/line-icon";
import UsagePageHeader from "@/features/usage/components/UsagePageHeader";
import UsageQuotaGrid from "@/features/usage/components/UsageQuotaGrid";
import UsageStatePanel from "@/features/usage/components/UsageStatePanel";
import useUsageOverview from "@/features/usage/hooks/useUsageOverview";
import useUsageTransport from "@/features/usage/hooks/useUsageTransport";
import { formatCount, formatDateTime, formatStatus } from "@/features/usage/helpers/usageHelpers";
import type { UsageOverviewData, UsageReviewStatus, UsageTransport } from "@/features/usage/types";

const operationStatuses: readonly UsageReviewStatus[] = [
  "COMPLETED",
  "PROCESSING",
  "PENDING",
  "FAILED",
  "CANCELLED",
];

interface UsageOverviewProps {
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

interface OverviewContentProps {
  readonly data: UsageOverviewData;
}

const OverviewContent: FC<OverviewContentProps> = ({ data }): ReactElement => {
  const { quota, summary } = data;

  return (
    <>
      <section className="usage-metric-grid" aria-label="Token and operation overview">
        <MetricCard
          label="Total tokens"
          note="Input plus output from completed results"
          value={formatCount(summary.totalTokens)}
        />
        <MetricCard
          label="Input tokens"
          note="Accepted summary field"
          value={formatCount(summary.inputTokens)}
        />
        <MetricCard
          label="Output tokens"
          note="Accepted summary field"
          value={formatCount(summary.outputTokens)}
        />
        <MetricCard
          label="Completed reviews"
          note="Operation count in the summary"
          value={formatCount(summary.completedReviews)}
        />
      </section>

      <div className="usage-dashboard-columns usage-overview-columns">
        <section className="usage-ledger-panel surface-panel" aria-labelledby="usage-input-heading">
          <header className="usage-section-header">
            <div>
              <p className="usage-card-kicker">Token direction</p>
              <h2 id="usage-input-heading" className="usage-section-title">
                See what entered and left the review boundary.
              </h2>
            </div>
            <span className="status-label">Additive total</span>
          </header>
          {summary.totalTokens > 0 ? (
            <dl className="usage-ledger-grid">
              <div>
                <dt>Input</dt>
                <dd>{formatCount(summary.inputTokens)}</dd>
              </div>
              <div>
                <dt>Output</dt>
                <dd>{formatCount(summary.outputTokens)}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{formatCount(summary.totalTokens)}</dd>
              </div>
            </dl>
          ) : (
            <div className="usage-empty-panel" role="status">
              <h3 className="usage-card-title">No completed usage yet</h3>
              <p>Token totals remain zero until a completed result contributes usage fields.</p>
            </div>
          )}
          <p className="usage-panel-note">
            No cost conversion is applied. The response contains token counts, not a price model.
          </p>
        </section>

        <section
          className="usage-ledger-panel surface-panel"
          aria-labelledby="usage-operation-heading"
        >
          <header className="usage-section-header">
            <div>
              <p className="usage-card-kicker">Operation mix</p>
              <h2 id="usage-operation-heading" className="usage-section-title">
                Counts stay separate from token totals.
              </h2>
            </div>
            <span className="status-label">Deep {formatCount(summary.deepReviews)}</span>
          </header>
          <dl className="usage-operation-list">
            {operationStatuses.map((status) => (
              <div key={status} className="usage-operation-row">
                <dt>
                  <span
                    className={`usage-record-status usage-record-status-${status.toLowerCase()}`}
                  >
                    {formatStatus(status)}
                  </span>
                </dt>
                <dd>{formatCount(summary.reviewsByStatus[status])}</dd>
              </div>
            ))}
          </dl>
          <p className="usage-panel-note">
            Deep count follows the accepted operation field. It is not a reasoning or model metric.
          </p>
        </section>
      </div>

      <section
        className="usage-deferred-panel surface-panel"
        aria-labelledby="usage-deferred-heading"
      >
        <header className="usage-section-header">
          <div>
            <p className="usage-card-kicker">Deferred fields</p>
            <h2 id="usage-deferred-heading" className="usage-section-title">
              What this contract does not measure.
            </h2>
          </div>
          <span className="status-label">Unavailable</span>
        </header>
        <ul className="usage-deferred-list">
          <li>
            <strong>Cost and spend</strong>
            <span>Deferred. No currency or price field is returned.</span>
          </li>
          <li>
            <strong>Model identity</strong>
            <span>Deferred. Summary and quota do not identify a model.</span>
          </li>
          <li>
            <strong>Provider attribution</strong>
            <span>Deferred. The accepted usage response has no provider field.</span>
          </li>
          <li>
            <strong>Reasoning measurements</strong>
            <span>Deferred. No reasoning duration or effort field is returned.</span>
          </li>
        </ul>
        <p className="usage-panel-note">
          Values are not estimated in the browser. Review result metadata is a separate contract and
          is not promoted into this usage summary.
        </p>
      </section>

      <section className="usage-quota-section" aria-labelledby="usage-overview-quota-heading">
        <header className="usage-section-header usage-section-header-wide">
          <div>
            <p className="usage-card-kicker">Operation quota</p>
            <h2 id="usage-overview-quota-heading" className="usage-section-title">
              Daily limits, kept beside the ledger.
            </h2>
          </div>
          <div className="usage-overview-links">
            <span className="status-label">UTC {quota.utcDay}</span>
            <a className="usage-inline-link" href="/dashboard">
              Back to dashboard
              <LineIcon name="arrow-up-right" />
            </a>
          </div>
        </header>
        <UsageQuotaGrid quota={quota} />
        <p className="usage-panel-note">Quota snapshot as of {formatDateTime(quota.asOf)} UTC.</p>
      </section>
    </>
  );
};

const UsageOverview: FC<UsageOverviewProps> = ({ transport: transportOverride }): ReactElement => {
  const transport = useUsageTransport(transportOverride);
  const { data, errorMessage, retry, status } = useUsageOverview(transport);

  const body =
    status === "loading" ? (
      <UsageStatePanel
        copy="Reading the accepted token, operation, and quota fields."
        title="Preparing the usage ledger"
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
      <OverviewContent data={data} />
    );

  return (
    <main id="main-content" className="usage-main shell-container">
      <UsagePageHeader
        description="Token and operation counts are visible where the accepted response supports them. Deferred fields stay named instead of guessed."
        kicker="Usage"
        source={transport.source}
        title="Read the usage ledger."
      />
      {body}
      <p className="usage-snapshot-note">
        Snapshot field: {transport.source === "demo" ? "fixed fixture" : "API asOf"}.
      </p>
    </main>
  );
};

export default UsageOverview;
