import type { FC, ReactElement } from "react";

import LineIcon from "@/components/line-icon";

interface UsageStatePanelProps {
  readonly actionLabel?: string;
  readonly copy: string;
  readonly onAction?: () => void;
  readonly title: string;
  readonly tone: "error" | "loading";
}

const UsageStatePanel: FC<UsageStatePanelProps> = ({
  actionLabel,
  copy,
  onAction,
  title,
  tone,
}): ReactElement => (
  <section
    className={`usage-state-panel usage-state-panel-${tone} surface-panel`}
    aria-busy={tone === "loading"}
    aria-live="polite"
    role={tone === "error" ? "alert" : "status"}
  >
    {tone === "loading" ? (
      <div className="usage-skeleton-stack" aria-hidden="true">
        <span className="usage-skeleton usage-skeleton-wide" />
        <span className="usage-skeleton usage-skeleton-medium" />
        <span className="usage-skeleton usage-skeleton-short" />
      </div>
    ) : null}
    <p className="usage-state-kicker">{tone === "error" ? "Read boundary" : "Loading"}</p>
    <h2 className="usage-state-title">{title}</h2>
    <p className="usage-state-copy">{copy}</p>
    {tone === "error" && onAction && actionLabel ? (
      <button className="action-secondary usage-state-action" type="button" onClick={onAction}>
        {actionLabel}
        <LineIcon name="refresh" />
      </button>
    ) : null}
  </section>
);

export default UsageStatePanel;
