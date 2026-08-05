"use client";

import Link from "next/link";
import { useCallback } from "react";
import type { ChangeEvent, FC, FormEvent, ReactElement } from "react";

import LineIcon from "@/components/line-icon";
import AuthField from "@/features/auth/components/AuthField";
import PasswordField from "@/features/auth/components/PasswordField";
import { useAuthForm } from "@/features/auth/hooks/useAuthForm";
import type { AuthFieldName, AuthMode } from "@/features/auth/types";

interface AuthCopy {
  readonly apiPath: string;
  readonly contextCopy: string;
  readonly contextTitle: string;
  readonly formCopy: string;
  readonly formTitle: string;
  readonly submitLabel: string;
  readonly successAction: string;
  readonly successHref: "/" | "/login";
  readonly successTitle: string;
  readonly switchHref: "/login" | "/register";
  readonly switchLabel: string;
  readonly switchPrompt: string;
}

const authCopy: Record<AuthMode, AuthCopy> = {
  login: {
    apiPath: "POST /api/v1/auth/login",
    contextCopy:
      "Return to the code changes, review signals, and learning notes already waiting in your workspace.",
    contextTitle: "Open the review desk.",
    formCopy: "Use the email and password attached to your RepoMentor session.",
    formTitle: "Sign in",
    submitLabel: "Sign in",
    successAction: "Return to workspace",
    successHref: "/",
    successTitle: "Request acknowledged",
    switchHref: "/register",
    switchLabel: "Create an account",
    switchPrompt: "New to RepoMentor?",
  },
  register: {
    apiPath: "POST /api/v1/auth/register",
    contextCopy:
      "Set a clear identity for the review desk that keeps explanations close to the changed line.",
    contextTitle: "Build your review desk.",
    formCopy: "Create the account that will hold your review history and learning path.",
    formTitle: "Create an account",
    submitLabel: "Create account",
    successAction: "Go to sign in",
    successHref: "/login",
    successTitle: "Account request acknowledged",
    switchHref: "/login",
    switchLabel: "Sign in",
    switchPrompt: "Already have an account?",
  },
};

const fieldError = (
  field: AuthFieldName,
  errors: Partial<Record<AuthFieldName, string>>,
  touched: Record<AuthFieldName, boolean>,
): string | undefined => (touched[field] ? errors[field] : undefined);

interface InputValueTarget {
  readonly value: string;
}

const readInputValue = (event: ChangeEvent<HTMLInputElement>): string =>
  (event.target as unknown as InputValueTarget).value;

interface AuthPageProps {
  readonly mode: AuthMode;
}

const AuthPage: FC<AuthPageProps> = ({ mode }): ReactElement => {
  const copy = authCopy[mode];
  const {
    errors,
    isSubmitting,
    markFieldTouched,
    serverMessage,
    status,
    submit,
    touched,
    updateField,
    values,
  } = useAuthForm(mode);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      void submit();
    },
    [submit],
  );

  const fieldsDisabled = isSubmitting || status === "success";
  const isSuccess = status === "success";

  return (
    <main id="main-content" className="auth-main shell-container">
      <div className="auth-layout">
        <section className="auth-context" aria-labelledby="auth-context-heading">
          <p className="section-kicker">Session checkpoint</p>
          <h1 id="auth-context-heading" className="auth-title">
            {copy.contextTitle}
          </h1>
          <p className="auth-context-copy">{copy.contextCopy}</p>

          <ol className="auth-steps" aria-label="Authentication flow">
            <li className="auth-step auth-step-current" aria-current="step">
              <span className="auth-step-number" aria-hidden="true">
                01
              </span>
              <span className="auth-step-copy">
                <strong>Credentials</strong>
                <span>Check the details before they leave this screen.</span>
              </span>
            </li>
            <li className="auth-step">
              <span className="auth-step-number" aria-hidden="true">
                02
              </span>
              <span className="auth-step-copy">
                <strong>Server session</strong>
                <span>Session state stays with the API boundary.</span>
              </span>
            </li>
          </ol>

          <p className="auth-boundary-note">
            No repository data is loaded at this checkpoint. The form is ready for the server
            handoff.
          </p>
        </section>

        <section className="auth-panel surface-panel" aria-labelledby="auth-form-heading">
          <header className="auth-panel-header">
            <div className="auth-panel-heading-row">
              <p className="auth-panel-overline">Account access</p>
              <span className="status-label status-label-accent">API seam</span>
            </div>
            <h2 id="auth-form-heading" className="auth-panel-title">
              {copy.formTitle}
            </h2>
            <p className="auth-panel-copy">{copy.formCopy}</p>
          </header>

          <form
            className="auth-form"
            noValidate
            onSubmit={handleSubmit}
            aria-describedby="auth-api-note"
            data-api-endpoint={copy.apiPath}
          >
            {mode === "register" ? (
              <AuthField
                autoComplete="name"
                description="Use the name you want to see beside review notes."
                error={fieldError("displayName", errors, touched)}
                label="Display name"
                name="displayName"
                onBlur={() => markFieldTouched("displayName")}
                onChange={(event) => updateField("displayName", readInputValue(event))}
                required
                value={values.displayName}
                disabled={fieldsDisabled}
              />
            ) : null}

            <AuthField
              autoComplete="email"
              description="Use the address connected to your RepoMentor account."
              error={fieldError("email", errors, touched)}
              label="Email address"
              name="email"
              onBlur={() => markFieldTouched("email")}
              onChange={(event) => updateField("email", readInputValue(event))}
              required
              type="email"
              value={values.email}
              disabled={fieldsDisabled}
            />

            <PasswordField
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              description={
                mode === "login"
                  ? "Enter the password for this session."
                  : "Use at least 12 characters for your account."
              }
              error={fieldError("password", errors, touched)}
              label="Password"
              name="password"
              onBlur={() => markFieldTouched("password")}
              onChange={(event) => updateField("password", readInputValue(event))}
              required
              value={values.password}
              disabled={fieldsDisabled}
            />

            {mode === "register" ? (
              <PasswordField
                autoComplete="new-password"
                description="Enter the same password again to confirm it."
                error={fieldError("passwordConfirmation", errors, touched)}
                label="Confirm password"
                name="passwordConfirmation"
                onBlur={() => markFieldTouched("passwordConfirmation")}
                onChange={(event) => updateField("passwordConfirmation", readInputValue(event))}
                required
                value={values.passwordConfirmation}
                disabled={fieldsDisabled}
              />
            ) : null}

            {status === "error" && serverMessage ? (
              <div className="auth-form-status auth-form-status-error" role="alert">
                <strong className="auth-form-status-title">Request not completed</strong>
                <p className="auth-form-status-copy">{serverMessage}</p>
              </div>
            ) : null}

            <button
              className="action-primary auth-submit"
              type="submit"
              aria-busy={isSubmitting}
              disabled={fieldsDisabled}
            >
              <span>
                {isSubmitting
                  ? "Checking details"
                  : isSuccess
                    ? "Request accepted"
                    : copy.submitLabel}
              </span>
              <LineIcon name="arrow-right" />
            </button>

            {status === "success" && serverMessage ? (
              <div className="auth-form-status auth-form-status-success" role="status">
                <strong className="auth-form-status-title">{copy.successTitle}</strong>
                <p className="auth-form-status-copy">{serverMessage}</p>
                <Link className="action-secondary auth-success-link" href={copy.successHref}>
                  {copy.successAction}
                  <LineIcon name="arrow-right" />
                </Link>
              </div>
            ) : null}

            <p className="auth-api-note" id="auth-api-note">
              Server handoff target: <code>{copy.apiPath}</code>. Session tokens remain outside this
              form until the application session owner is connected.
            </p>
          </form>

          <p className="auth-switch">
            {copy.switchPrompt}{" "}
            <Link className="auth-switch-link" href={copy.switchHref}>
              {copy.switchLabel}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
};

export default AuthPage;
