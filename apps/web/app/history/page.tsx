import type { Metadata } from "next";
import type { ReactElement } from "react";

import UsageHistory from "@/features/usage/components/UsageHistory";

export const metadata: Metadata = {
  title: "History",
};

const HistoryPage = (): ReactElement => <UsageHistory />;

export default HistoryPage;
