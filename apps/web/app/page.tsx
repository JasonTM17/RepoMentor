import type { ReactElement } from "react";

interface Principle {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
}

interface MapEntry {
  readonly path: string;
  readonly purpose: string;
}

const principles: readonly Principle[] = [
  {
    eyebrow: "Understand",
    title: "Feedback with context",
    description:
      "The future review loop will explain trade-offs in plain language, so useful feedback is easier to act on.",
  },
  {
    eyebrow: "Improve",
    title: "A clear next step",
    description:
      "Review findings should point toward a better implementation without hiding the reasoning behind it.",
  },
  {
    eyebrow: "Remember",
    title: "Learning that compounds",
    description:
      "Each review is designed to become a reusable lesson, not just another status check in a queue.",
  },
];

const implementationMap: readonly MapEntry[] = [
  { path: "app/layout.tsx", purpose: "shared shell and navigation" },
  { path: "app/page.tsx", purpose: "developer-facing landing route" },
  { path: "app/globals.css", purpose: "Tailwind-compatible visual foundation" },
];

const HomePage = (): ReactElement => (
  <main
    id="main-content"
    className="mx-auto w-full max-w-6xl px-6 pb-20 pt-12 sm:px-8 sm:pt-16 lg:px-10 lg:pt-24"
  >
    <section
      aria-labelledby="hero-heading"
      className="grid items-center gap-12 lg:grid-cols-[1.12fr_0.88fr]"
    >
      <div>
        <p className="eyebrow">
          <span
            className="size-2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.9)]"
            aria-hidden="true"
          />
          Phase 02 · application shell
        </p>
        <h1
          id="hero-heading"
          className="mt-7 max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-0.055em] text-white sm:text-6xl lg:text-7xl"
        >
          Make every code review a <span className="text-cyan-200">learning loop.</span>
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
          RepoMentor is being built to turn code review into feedback you can understand, apply, and
          remember. This first web slice establishes the surface that later editor and review flows
          will share.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <a className="button-primary" href="#workflow">
            Explore the scaffold
            <span aria-hidden="true">↗</span>
          </a>
          <a className="button-secondary" href="#status">
            See the handoff map
            <span aria-hidden="true">↓</span>
          </a>
        </div>
        <p className="mt-5 font-mono text-xs uppercase tracking-[0.16em] text-slate-500">
          Route-ready · no backend calls · strict TypeScript
        </p>
      </div>

      <aside aria-labelledby="map-heading" className="surface-panel rounded-3xl p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-cyan-200">apps/web/</p>
          <span className="rounded-full border border-cyan-200/20 bg-cyan-200/10 px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-cyan-100">
            ready
          </span>
        </div>
        <h2 id="map-heading" className="mt-7 text-2xl font-semibold tracking-[-0.03em] text-white">
          Small boundaries. Clear handoff.
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          The first route is intentionally quiet: it proves the application boundary and leaves room
          for domain work to arrive in focused slices.
        </p>
        <dl className="mt-8 divide-y divide-white/10 border-y border-white/10">
          {implementationMap.map((entry) => (
            <div key={entry.path} className="grid gap-1 py-4 sm:grid-cols-[1.2fr_1fr] sm:gap-4">
              <dt className="font-mono text-sm text-slate-200">{entry.path}</dt>
              <dd className="text-sm text-slate-500">{entry.purpose}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-7 flex items-start gap-3 rounded-2xl bg-slate-950/70 p-4 text-sm leading-6 text-slate-400">
          <span className="mt-2 size-2 shrink-0 rounded-full bg-emerald-300" aria-hidden="true" />
          <p>
            Static shell only. Authentication, editor state, and review data will be introduced by
            their owning phases.
          </p>
        </div>
      </aside>
    </section>

    <section
      id="workflow"
      aria-labelledby="workflow-heading"
      className="mt-28 scroll-mt-8 sm:mt-36"
    >
      <div className="max-w-2xl">
        <p className="eyebrow">Built for the next commits</p>
        <h2
          id="workflow-heading"
          className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl"
        >
          One calm place for a complex review loop.
        </h2>
        <p className="mt-4 text-base leading-7 text-slate-400">
          The layout gives future features a stable visual language while keeping this phase honest
          about what is and is not connected yet.
        </p>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {principles.map((principle, index) => (
          <article key={principle.title} className="surface-panel rounded-3xl p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-cyan-200">
                {principle.eyebrow}
              </span>
              <span className="font-mono text-xs text-slate-600" aria-hidden="true">
                0{index + 1}
              </span>
            </div>
            <h3 className="mt-12 text-xl font-semibold tracking-[-0.025em] text-white">
              {principle.title}
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">{principle.description}</p>
          </article>
        ))}
      </div>
    </section>

    <section id="status" aria-labelledby="status-heading" className="mt-24 scroll-mt-8 sm:mt-32">
      <div className="surface-panel overflow-hidden rounded-3xl">
        <div className="grid gap-10 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
          <div>
            <p className="eyebrow">Developer handoff</p>
            <h2
              id="status-heading"
              className="mt-6 max-w-xl text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl"
            >
              The boundary is intentional.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-400">
              This shell is ready to host authenticated routes and review workflows, but it does not
              pretend those systems exist yet. That separation keeps the next phase easy to review
              and safe to extend.
            </p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="font-mono text-xs uppercase tracking-[0.16em] text-slate-500">
                Runtime
              </dt>
              <dd className="mt-2 text-sm font-medium text-slate-200">Next.js App Router</dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="font-mono text-xs uppercase tracking-[0.16em] text-slate-500">
                Styling seam
              </dt>
              <dd className="mt-2 text-sm font-medium text-slate-200">
                Tailwind CSS + shadcn aliases
              </dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="font-mono text-xs uppercase tracking-[0.16em] text-slate-500">
                Current data
              </dt>
              <dd className="mt-2 text-sm font-medium text-slate-200">
                Static scaffold content only
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  </main>
);

export default HomePage;
