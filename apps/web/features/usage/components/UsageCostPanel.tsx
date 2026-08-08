import type { FC, ReactElement } from "react";

import { formatEstimatedCost, formatPricingVersion } from "@/features/usage/helpers/usageHelpers";
import type { UsageSummaryData, UsageTransport } from "@/features/usage/types";

interface UsageCostPanelProps {
  readonly source: UsageTransport["source"];
  readonly summary: UsageSummaryData;
}

const UsageCostPanel: FC<UsageCostPanelProps> = ({ source, summary }): ReactElement => {
  const isAvailable =
    summary.costStatus === "AVAILABLE" &&
    summary.estimatedCostMicros !== null &&
    summary.pricingVersion !== null;

  const unavailableCopy =
    summary.costStatus === "MIXED"
      ? "Unavailable for this summary because persisted rows do not share one pricing version."
      : "Unavailable because no compatible persisted pricing estimate is present.";

  return (
    <section
      className="usage-cost-panel usage-ledger-panel surface-panel"
      data-cost-status={summary.costStatus}
      aria-labelledby="usage-cost-heading"
    >
      <header className="usage-section-header">
        <div>
          <p className="usage-card-kicker">Estimated cost</p>
          <h2 id="usage-cost-heading" className="usage-section-title">
            {isAvailable
              ? source === "demo"
                ? "Deterministic demo estimate"
                : "Configuration-based estimate"
              : "Estimated cost unavailable"}
          </h2>
        </div>
        <span className={isAvailable ? "status-label status-label-accent" : "status-label"}>
          {isAvailable ? "Available" : "Unavailable"}
        </span>
      </header>
      {isAvailable ? (
        <div className="usage-cost-value-block">
          <p className="usage-cost-value usage-metric-value">
            {formatEstimatedCost(summary.estimatedCostMicros)}
          </p>
          <p className="usage-panel-note">
            {source === "demo"
              ? "Deterministic fixture value only; this is not a live bill."
              : "Server-provided integer micro-USD estimate; no browser-side price conversion is applied."}
          </p>
          <p className="usage-cost-provenance usage-panel-note">
            {formatPricingVersion(summary.pricingVersion)}
          </p>
        </div>
      ) : (
        <div className="usage-cost-unavailable" role="status">
          <p className="usage-cost-unavailable-title">No estimate is shown.</p>
          <p className="usage-panel-note">
            {unavailableCopy} Configure all four server pricing variables together to create new
            estimates. Historical rows without a persisted estimate remain unavailable.
          </p>
        </div>
      )}
    </section>
  );
};

export default UsageCostPanel;
