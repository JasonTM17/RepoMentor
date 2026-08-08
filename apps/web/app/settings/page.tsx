import type { Metadata } from "next";
import type { ReactElement } from "react";

import PasswordChangePage from "@/features/auth/components/PasswordChangePage";

export const metadata: Metadata = {
  title: "Settings",
};

const SettingsPage = (): ReactElement => <PasswordChangePage />;

export default SettingsPage;
