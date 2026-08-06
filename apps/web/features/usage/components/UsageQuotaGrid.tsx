import type { FC, ReactElement } from "react";

import { formatCount, formatMode } from "@/features/usage/helpers/usageHelpers";
import type { UsageQuotaData, UsageReviewMode } from "@/features/usage/types";

const quotaModes: readonly UsageReviewMode[] = ["QUICK", "STANDARD", "DEEP"];

interface UsageQuotaGridProps {
  readonly quota: UsageQuotaData;
}

const UsageQuotaGrid: FC<UsageQuotaGridProps> = ({ quota }): ReactElement => (
  <div className="usage-quota-grid">
    {quotaModes.map((mode) => {
      const { limit, remaining, used } = quota.modes[mode];
      const overage = Math.max(0, used - limit);
      const percentage = limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
      const quotaValueText = `${formatCount(used)} used, ${formatCount(limit)} limit, ${formatCount(remaining)} remaining${overage > 0 ? `, overage ${formatCount(overage)}` : ""}`;

      return (
        <article key={mode} className="usage-quota-card">
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
            aria-valuenow={Math.min(used, limit)}
            aria-valuetext={quotaValueText}
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
    })}
  </div>
);

export default UsageQuotaGrid;
