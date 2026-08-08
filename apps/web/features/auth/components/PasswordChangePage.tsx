"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent, ReactElement } from "react";
import { useRouter } from "next/navigation";

import LineIcon from "@/components/line-icon";
import { authClient, AuthClientError } from "@/features/auth/api/authClient";
import PasswordField from "@/features/auth/components/PasswordField";
import type { ChangePasswordRequest } from "@/features/auth/types";

type PasswordFieldName = keyof ChangePasswordRequest;
type PasswordChangeStatus = "idle" | "loading" | "error" | "success";

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

const initialValues: ChangePasswordRequest = {
  currentPassword: "",
  newPassword: "",
  newPasswordConfirmation: "",
};

const fieldLabels: Record<PasswordFieldName, string> = {
  currentPassword: "Current password",
  newPassword: "New password",
  newPasswordConfirmation: "Confirm new password",
};

const validate = (values: ChangePasswordRequest): Partial<Record<PasswordFieldName, string>> => {
  const errors: Partial<Record<PasswordFieldName, string>> = {};

  if (values.currentPassword.length === 0) {
    errors.currentPassword = "Enter your current password.";
  }

  if (
    values.newPassword.length < MIN_PASSWORD_LENGTH ||
    values.newPassword.length > MAX_PASSWORD_LENGTH
  ) {
    errors.newPassword = `Use ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`;
  }

  if (values.newPasswordConfirmation !== values.newPassword) {
    errors.newPasswordConfirmation = "Enter the same new password again.";
  }

  if (values.currentPassword === values.newPassword && values.newPassword.length > 0) {
    errors.newPassword = "Choose a password different from the current password.";
  }

  return errors;
};

const serverErrorMessage = (error: unknown): string => {
  if (error instanceof AuthClientError && error.status === 401) {
    return "Your session has expired. Sign in again, then retry the password change.";
  }

  if (error instanceof AuthClientError && error.status === 400) {
    return "The password details were not accepted. Check the requirements and try again.";
  }

  return "The password could not be changed. Try again without leaving this page.";
};

interface InputValueTarget {
  readonly value: string;
}

const readInputValue = (event: ChangeEvent<HTMLInputElement>): string =>
  (event.target as unknown as InputValueTarget).value;

const PasswordChangePage = (): ReactElement => {
  const router = useRouter();
  const [values, setValues] = useState<ChangePasswordRequest>(initialValues);
  const [touched, setTouched] = useState<Record<PasswordFieldName, boolean>>({
    currentPassword: false,
    newPassword: false,
    newPasswordConfirmation: false,
  });
  const [status, setStatus] = useState<PasswordChangeStatus>("idle");
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  const errors = validate(values);

  useEffect(() => {
    if (status !== "success") {
      return undefined;
    }

    const navigationTimer = globalThis.setTimeout(() => {
      router.replace("/login?password=changed");
    }, 900);

    return () => globalThis.clearTimeout(navigationTimer);
  }, [router, status]);

  const updateField = useCallback((field: PasswordFieldName, value: string): void => {
    setValues((current) => ({ ...current, [field]: value }));
    setStatus((current) => (current === "error" ? "idle" : current));
    setServerMessage(null);
  }, []);

  const markAllTouched = useCallback((): void => {
    setTouched({
      currentPassword: true,
      newPassword: true,
      newPasswordConfirmation: true,
    });
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      markAllTouched();
      const nextErrors = validate(values);

      if (Object.keys(nextErrors).length > 0) {
        setStatus("idle");
        setServerMessage(null);
        return;
      }

      setStatus("loading");
      setServerMessage(null);

      try {
        await authClient.changePassword(values);
        setValues(initialValues);
        setStatus("success");
        setServerMessage("Password changed. Redirecting you to sign in again.");
      } catch (error: unknown) {
        setStatus("error");
        setServerMessage(serverErrorMessage(error));
      }
    },
    [markAllTouched, values],
  );

  const fieldsDisabled = status === "loading" || status === "success";
  const fieldError = (field: PasswordFieldName): string | undefined =>
    touched[field] ? errors[field] : undefined;

  return (
    <main id="main-content" className="auth-main shell-container settings-main">
      <div className="auth-layout">
        <section className="auth-context" aria-labelledby="settings-context-heading">
          <p className="section-kicker">Account settings</p>
          <h1 id="settings-context-heading" className="auth-title">
            Keep the session under your control.
          </h1>
          <p className="auth-context-copy">
            Change your password at the API boundary. Every active session is revoked after a
            successful change, so the next step is a fresh sign-in.
          </p>

          <ol className="auth-steps" aria-label="Password change flow">
            <li className="auth-step auth-step-current" aria-current="step">
              <span className="auth-step-number" aria-hidden="true">
                01
              </span>
              <span className="auth-step-copy">
                <strong>Verify</strong>
                <span>Confirm the current password before the request leaves this screen.</span>
              </span>
            </li>
            <li className="auth-step">
              <span className="auth-step-number" aria-hidden="true">
                02
              </span>
              <span className="auth-step-copy">
                <strong>Re-authenticate</strong>
                <span>Sign in again after the API revokes every active session.</span>
              </span>
            </li>
          </ol>

          <p className="auth-boundary-note">
            Password values stay in this form and are sent only to the configured API endpoint.
          </p>
        </section>

        <section className="auth-panel surface-panel" aria-labelledby="settings-form-heading">
          <header className="auth-panel-header">
            <div className="auth-panel-heading-row">
              <p className="auth-panel-overline">Credential control</p>
              <span className="status-label status-label-accent">Protected route</span>
            </div>
            <h2 id="settings-form-heading" className="auth-panel-title">
              Change password
            </h2>
            <p className="auth-panel-copy">
              Use a new password with at least {MIN_PASSWORD_LENGTH} characters. The API never
              returns password material in its response.
            </p>
          </header>

          <form
            className="auth-form"
            noValidate
            onSubmit={(event) => void handleSubmit(event)}
            aria-describedby="password-api-note"
            data-api-endpoint="PATCH /api/v1/auth/password"
          >
            <PasswordField
              autoComplete="current-password"
              description="Enter the password currently attached to your account."
              disabled={fieldsDisabled}
              error={fieldError("currentPassword")}
              label={fieldLabels.currentPassword}
              name="currentPassword"
              onBlur={() => setTouched((current) => ({ ...current, currentPassword: true }))}
              onChange={(event) => updateField("currentPassword", readInputValue(event))}
              required
              value={values.currentPassword}
            />

            <PasswordField
              autoComplete="new-password"
              description={`Use ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`}
              disabled={fieldsDisabled}
              error={fieldError("newPassword")}
              label={fieldLabels.newPassword}
              name="newPassword"
              onBlur={() => setTouched((current) => ({ ...current, newPassword: true }))}
              onChange={(event) => updateField("newPassword", readInputValue(event))}
              required
              value={values.newPassword}
            />

            <PasswordField
              autoComplete="new-password"
              description="Enter the same new password again to confirm it."
              disabled={fieldsDisabled}
              error={fieldError("newPasswordConfirmation")}
              label={fieldLabels.newPasswordConfirmation}
              name="newPasswordConfirmation"
              onBlur={() =>
                setTouched((current) => ({ ...current, newPasswordConfirmation: true }))
              }
              onChange={(event) => updateField("newPasswordConfirmation", readInputValue(event))}
              required
              value={values.newPasswordConfirmation}
            />

            {status === "error" && serverMessage ? (
              <div className="auth-form-status auth-form-status-error" role="alert">
                <strong className="auth-form-status-title">Request not completed</strong>
                <p className="auth-form-status-copy">{serverMessage}</p>
              </div>
            ) : null}

            <button
              className="action-primary auth-submit"
              type="submit"
              aria-busy={status === "loading"}
              disabled={fieldsDisabled}
            >
              <span>
                {status === "loading"
                  ? "Changing password"
                  : status === "success"
                    ? "Password changed"
                    : "Change password"}
              </span>
              <LineIcon name="arrow-right" />
            </button>

            {status === "success" && serverMessage ? (
              <div className="auth-form-status auth-form-status-success" role="status">
                <strong className="auth-form-status-title">Password updated</strong>
                <p className="auth-form-status-copy">{serverMessage}</p>
                <Link className="action-secondary auth-success-link" href="/login">
                  Sign in now
                  <LineIcon name="arrow-right" />
                </Link>
              </div>
            ) : null}

            <p className="auth-api-note" id="password-api-note">
              Server handoff target: <code>PATCH /api/v1/auth/password</code>. Access tokens remain
              memory-only; the API owns the refresh cookie and revokes it after this change.
            </p>
          </form>
        </section>
      </div>
    </main>
  );
};

export default PasswordChangePage;
