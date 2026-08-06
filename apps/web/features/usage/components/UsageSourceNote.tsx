import type { FC, ReactElement } from "react";

import type { UsageTransport } from "@/features/usage/types";

interface UsageSourceNoteProps {
  readonly source: UsageTransport["source"];
}

const UsageSourceNote: FC<UsageSourceNoteProps> = ({ source }): ReactElement => (
  <aside className="usage-source-note" data-transport-mode={source}>
    <span className="status-label status-label-accent">
      {source === "demo" ? "Demo transport" : "API seam"}
    </span>
    <p>
      {source === "demo"
        ? "Deterministic fixture values only. No authenticated session or live metrics are connected."
        : "Authenticated read-only usage requests use the accepted API contract. Browser provider controls are not present."}
    </p>
  </aside>
);

export default UsageSourceNote;
