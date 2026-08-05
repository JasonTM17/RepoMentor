import Link from "next/link";
import type { ReactElement } from "react";

const NotFound = (): ReactElement => (
  <main
    id="main-content"
    className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-20 sm:px-8 lg:px-10"
  >
    <section
      className="surface-panel w-full rounded-3xl p-8 sm:p-12"
      aria-labelledby="not-found-heading"
    >
      <p className="eyebrow">404 · route boundary</p>
      <h1
        id="not-found-heading"
        className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-white"
      >
        This route is not in the scaffold yet.
      </h1>
      <p className="mt-3 max-w-xl text-base leading-7 text-slate-400">
        The application will grow into the review workspace one focused route at a time.
      </p>
      <Link className="button-primary mt-8" href="/">
        Back to home
        <span aria-hidden="true">↗</span>
      </Link>
    </section>
  </main>
);

export default NotFound;
