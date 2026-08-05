import type { ReactElement } from "react";

const Loading = (): ReactElement => (
  <main id="main-content" className="shell-container shell-status-page">
    <section className="state-panel" aria-labelledby="loading-heading">
      <div className="state-panel-body">
        <p className="section-kicker" role="status" aria-live="polite">
          Preparing the workspace
        </p>
        <h1 id="loading-heading" className="state-title">
          Loading the review surface
        </h1>
        <p className="state-copy">
          The shell is getting ready. Connected review data will appear in its owning route when
          that flow is available.
        </p>
        <div className="loading-skeletons" aria-hidden="true">
          <span className="loading-skeleton" />
          <span className="loading-skeleton" />
          <span className="loading-skeleton" />
        </div>
      </div>
    </section>
  </main>
);

export default Loading;
