import type { Metadata } from "next";
import type { ReactElement } from "react";

import HistoryWorkspace from "@/features/history/components/HistoryWorkspace";

export const metadata: Metadata = {
  title: "History",
};

const HistoryPage = (): ReactElement => <HistoryWorkspace />;

export default HistoryPage;
