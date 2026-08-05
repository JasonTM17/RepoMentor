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
    <body>{children}</body>
  </html>
);

export default RootLayout;
