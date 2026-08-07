import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";

import LineIcon from "@/components/line-icon";
import AuthSessionAction from "@/features/auth/components/AuthSessionAction";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "RepoMentor",
    template: "%s | RepoMentor",
  },
  description: "A developer-first code review and programming tutor workspace.",
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
      <div className="site-frame">
        <header className="site-header">
          <div className="shell-container site-header-inner">
            <a className="brand-link" href="/" aria-label="RepoMentor home">
              <span className="brand-mark">
                <LineIcon name="code" />
              </span>
              <span className="brand-name">RepoMentor</span>
            </a>

            <nav className="primary-nav" aria-label="Primary navigation">
              <a className="nav-link" href="/reviews/new">
                Workspace
              </a>
              <a className="nav-link" href="/dashboard">
                Dashboard
              </a>
              <a className="nav-link" href="/history">
                History
              </a>
              <a className="nav-link" href="/usage">
                Usage
              </a>
              <a className="nav-link" href="/#learning-loop">
                Approach
              </a>
              <a className="nav-link" href="/#status">
                Status
              </a>
            </nav>

            <AuthSessionAction />
          </div>
        </header>

        <div className="shell-main">{children}</div>

        <footer className="site-footer">
          <div className="shell-container site-footer-inner">
            <p className="footer-note">
              <strong>RepoMentor</strong> gives code review a place to teach.
            </p>
            <p className="footer-meta">Review API bridge / demo usage fixtures</p>
          </div>
        </footer>
      </div>
    </body>
  </html>
);

export default RootLayout;
