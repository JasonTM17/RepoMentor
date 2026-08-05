import type { Metadata } from "next";
import type { ReactElement } from "react";

import AuthPage from "@/features/auth/components/AuthPage";

export const metadata: Metadata = {
  title: "Sign in",
};

const LoginPage = (): ReactElement => <AuthPage mode="login" />;

export default LoginPage;
