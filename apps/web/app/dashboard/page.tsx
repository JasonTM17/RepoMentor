import type { Metadata } from "next";
import type { ReactElement } from "react";

import UsageDashboard from "@/features/usage/components/UsageDashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

const DashboardPage = (): ReactElement => <UsageDashboard />;

export default DashboardPage;
