import type { Metadata } from "next";
import type { ReactElement } from "react";

import UsageOverview from "@/features/usage/components/UsageOverview";

export const metadata: Metadata = {
  title: "Usage",
};

const UsagePage = (): ReactElement => <UsageOverview />;

export default UsagePage;
