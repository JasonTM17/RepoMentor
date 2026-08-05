import type { ReactElement } from "react";

const Loading = (): ReactElement => (
  <main
    id="main-content"
    className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-20 sm:px-8 lg:px-10"
  >
    <section
      className="surface-panel w-full rounded-3xl p-8 sm:p-12"
      aria-labelledby="loading-heading"
    >
      <div className="flex items-center gap-3" role="status" aria-live="polite">
        <span className="size-2 animate-pulse rounded-full bg-cyan-300" aria-hidden="true" />
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-cyan-200">
          Loading RepoMentor
        </p>
      </div>
      <h1
        id="loading-heading"
        className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-white"
      >
        Preparing the application shell…
      </h1>
      <p className="mt-3 max-w-xl text-base leading-7 text-slate-400">
        The route is loading. Feature data will appear here only when its owning phase is connected.
      </p>
    </section>
  </main>
);

export default Loading;
