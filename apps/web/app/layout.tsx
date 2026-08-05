import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "RepoMentor",
    template: "%s | RepoMentor",
  },
  description: "A developer-first AI code review and programming tutor.",
};

interface RootLayoutProps {
  children: ReactNode;
}

const RootLayout = ({ children }: RootLayoutProps): ReactElement => (
  <html lang="en">
    <body>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="border-b border-white/10 bg-slate-950/75 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-5 sm:px-8 lg:px-10">
            <a
              className="group flex shrink-0 items-center gap-3"
              href="/"
              aria-label="RepoMentor home"
            >
              <span
                className="flex size-9 items-center justify-center rounded-xl bg-cyan-300 font-mono text-sm font-bold text-slate-950 shadow-[0_0_24px_rgba(103,232,249,0.28)] transition-transform group-hover:-rotate-6"
                aria-hidden="true"
              >
                R
              </span>
              <span className="text-sm font-semibold tracking-wide text-white sm:text-base">
                RepoMentor
              </span>
            </a>

            <nav
              aria-label="Primary navigation"
              className="flex items-center gap-3 text-xs sm:gap-6 sm:text-sm"
            >
              <a className="text-slate-300 transition-colors hover:text-white" href="/#workflow">
                Workflow
              </a>
              <a className="text-slate-300 transition-colors hover:text-white" href="/#status">
                Handoff
              </a>
              <span className="hidden rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.16em] text-emerald-200 sm:inline-flex">
                scaffold online
              </span>
            </nav>
          </div>
        </header>

        <div className="flex-1">{children}</div>

        <footer className="border-t border-white/10">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
            <p>
              <span className="font-medium text-slate-200">RepoMentor</span> · a calmer way to learn
              from code review.
            </p>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-slate-500">
              Phase 02 · application shell
            </p>
          </div>
        </footer>
      </div>
    </body>
  </html>
);

export default RootLayout;
