"use client";

import { useCallback, useState } from "react";

import { authClient } from "@/features/auth/api/authClient";
import { validateAuthField, validateAuthForm } from "@/features/auth/helpers/validation";
import {
  AUTH_FIELDS_BY_MODE,
  AUTH_GENERIC_ERROR,
  type AuthFieldErrors,
  type AuthFieldName,
  type AuthFormStatus,
  type AuthFormValues,
  type AuthMode,
} from "@/features/auth/types";

const createInitialValues = (): AuthFormValues => ({
  displayName: "",
  email: "",
  password: "",
  passwordConfirmation: "",
});

const initialTouchedState = (): Record<AuthFieldName, boolean> => ({
  displayName: false,
  email: false,
  password: false,
  passwordConfirmation: false,
});

export interface UseAuthFormResult {
  readonly errors: AuthFieldErrors;
  readonly isSubmitting: boolean;
  readonly serverMessage: string | null;
  readonly status: AuthFormStatus;
  readonly touched: Record<AuthFieldName, boolean>;
  readonly values: AuthFormValues;
  readonly markFieldTouched: (field: AuthFieldName) => void;
  readonly submit: () => Promise<boolean>;
  readonly updateField: (field: AuthFieldName, value: string) => void;
}

export const useAuthForm = (mode: AuthMode): UseAuthFormResult => {
  const [values, setValues] = useState<AuthFormValues>(createInitialValues);
  const [errors, setErrors] = useState<AuthFieldErrors>({});
  const [touched, setTouched] = useState<Record<AuthFieldName, boolean>>(initialTouchedState);
  const [status, setStatus] = useState<AuthFormStatus>("idle");
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  const updateField = useCallback((field: AuthFieldName, value: string): void => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
    setStatus((current) => (current === "error" ? "idle" : current));
    setServerMessage(null);
  }, []);

  const markFieldTouched = useCallback(
    (field: AuthFieldName): void => {
      setTouched((current) => ({ ...current, [field]: true }));
      setErrors((current) => ({
        ...current,
        [field]: validateAuthField(field, values[field], values, mode),
      }));
    },
    [mode, values],
  );

  const submit = useCallback(async (): Promise<boolean> => {
    const nextErrors = validateAuthForm(values, mode);
    const nextTouched = { ...initialTouchedState() };

    AUTH_FIELDS_BY_MODE[mode].forEach((field) => {
      nextTouched[field] = true;
    });

    setTouched(nextTouched);
    setErrors(nextErrors);
    setServerMessage(null);

    if (Object.keys(nextErrors).length > 0) {
      setStatus("idle");
      return false;
    }

    setStatus("loading");

    try {
      if (mode === "login") {
        await authClient.login({
          email: values.email.trim().toLowerCase(),
          password: values.password,
        });
      } else {
        await authClient.register({
          displayName: values.displayName.trim(),
          email: values.email.trim().toLowerCase(),
          password: values.password,
        });
      }

      setStatus("success");
      setServerMessage(
        mode === "login"
          ? "The server accepted the credentials. Open the review workspace to start an authenticated review."
          : "Your account request was accepted. Sign in to continue. Registration does not sign you in automatically.",
      );
      return true;
    } catch {
      setStatus("error");
      setServerMessage(AUTH_GENERIC_ERROR);
      return false;
    }
  }, [mode, values]);

  return {
    errors,
    isSubmitting: status === "loading",
    markFieldTouched,
    serverMessage,
    status,
    submit,
    touched,
    updateField,
    values,
  };
};

export default useAuthForm;
