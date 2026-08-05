import Link from "next/link";
import type { ReactElement } from "react";

import LineIcon from "@/components/line-icon";

const NotFound = (): ReactElement => (
  <main id="main-content" className="shell-container shell-status-page">
    <section
      className="state-panel"
      aria-labelledby="not-found-heading"
      aria-describedby="not-found-copy"
    >
      <div className="state-panel-body">
        <p className="section-kicker">Route boundary</p>
        <h1 id="not-found-heading" className="state-title">
          This route is not in the shell yet.
        </h1>
        <p id="not-found-copy" className="state-copy">
          The review workspace will grow one focused route at a time. Start from the current shell
          to see what is available today.
        </p>
        <div className="state-actions">
          <Link className="action-primary" href="/">
            Back to home
            <LineIcon name="arrow-up-right" />
          </Link>
        </div>
      </div>
    </section>
  </main>
);

export default NotFound;
