"use client";

import type { FC } from "react";

interface ErrorPageProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

const ErrorPage: FC<ErrorPageProps> = ({ reset }) => (
  <main
    id="main-content"
    className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-20 sm:px-8 lg:px-10"
  >
    <section
      className="surface-panel w-full rounded-3xl p-8 sm:p-12"
      role="alert"
      aria-labelledby="error-heading"
    >
      <p className="eyebrow">Route boundary</p>
      <h1 id="error-heading" className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-white">
        We couldn’t render this page.
      </h1>
      <p className="mt-3 max-w-xl text-base leading-7 text-slate-400">
        The application caught an unexpected rendering error. Try the route again or return to the
        scaffold home.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button className="button-primary" type="button" onClick={reset}>
          Try again
        </button>
        <a className="button-secondary" href="/">
          Return home
        </a>
      </div>
    </section>
  </main>
);

export default ErrorPage;
