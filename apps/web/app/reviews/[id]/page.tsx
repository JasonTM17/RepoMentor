import type { Metadata } from "next";
import type { ReactElement } from "react";

import ReviewDetailPage from "@/features/review/components/ReviewDetailPage";

export const metadata: Metadata = {
  title: "Review detail",
};

const ReviewDetailRoute = (): ReactElement => <ReviewDetailPage />;

export default ReviewDetailRoute;
