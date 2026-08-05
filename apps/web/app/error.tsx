"use client";

import type { FC } from "react";

import LineIcon from "@/components/line-icon";

interface ErrorPageProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

const ErrorPage: FC<ErrorPageProps> = ({ reset }) => (
  <main id="main-content" className="shell-container shell-status-page">
    <section
      className="state-panel"
      role="alert"
      aria-labelledby="error-heading"
      aria-describedby="error-copy"
    >
      <div className="state-panel-body">
        <p className="section-kicker">Route boundary</p>
        <h1 id="error-heading" className="state-title">
          The workspace could not render.
        </h1>
        <p id="error-copy" className="state-copy">
          RepoMentor caught an unexpected rendering error. Try the route again or return to the
          application shell.
        </p>
        <div className="state-actions">
          <button className="action-primary" type="button" onClick={reset}>
            Try again
            <LineIcon name="refresh" />
          </button>
          <a className="action-secondary" href="/">
            Return home
          </a>
        </div>
      </div>
    </section>
  </main>
);

export default ErrorPage;
