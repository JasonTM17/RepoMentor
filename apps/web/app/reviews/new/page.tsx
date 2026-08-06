import type { Metadata } from "next";
import type { ReactElement } from "react";

import ReviewWorkspace from "@/features/review/components/ReviewWorkspace";

export const metadata: Metadata = {
  title: "New review",
};

const NewReviewPage = (): ReactElement => <ReviewWorkspace />;

export default NewReviewPage;
