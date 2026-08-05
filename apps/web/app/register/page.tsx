import type { Metadata } from "next";
import type { ReactElement } from "react";

import AuthPage from "@/features/auth/components/AuthPage";

export const metadata: Metadata = {
  title: "Create an account",
};

const RegisterPage = (): ReactElement => <AuthPage mode="register" />;

export default RegisterPage;
