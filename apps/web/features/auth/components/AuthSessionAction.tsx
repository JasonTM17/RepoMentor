"use client";

import { useCallback, useState } from "react";
import type { ReactElement } from "react";

import LineIcon from "@/components/line-icon";
import { authClient } from "@/features/auth/api/authClient";
import { useAuthSession, useInitializeAuthSession } from "@/features/auth/authSession";

type SessionActionStatus = "idle" | "loading" | "error";

const AuthSessionAction = (): ReactElement => {
  useInitializeAuthSession();
  const { accessToken } = useAuthSession();
  const [status, setStatus] = useState<SessionActionStatus>("idle");

  const handleLogout = useCallback(async (): Promise<void> => {
    setStatus("loading");

    try {
      await authClient.logout();
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }, []);

  if (!accessToken) {
    return (
      <a className="header-action" href="/login" aria-label="Sign in to RepoMentor">
        <span className="header-action-label-full">Sign in</span>
        <span className="header-action-label-compact" aria-hidden="true">
          Sign in
        </span>
        <LineIcon name="arrow-up-right" />
      </a>
    );
  }

  const fullLabel =
    status === "loading" ? "Signing out" : status === "error" ? "Retry sign out" : "Sign out";
  const compactLabel = status === "error" ? "Retry" : status === "loading" ? "Wait" : "Sign out";

  return (
    <button
      className="header-action"
      type="button"
      aria-busy={status === "loading"}
      aria-label={fullLabel}
      data-session-state="authenticated"
      disabled={status === "loading"}
      onClick={() => void handleLogout()}
    >
      <span className="header-action-label-full">{fullLabel}</span>
      <span className="header-action-label-compact" aria-hidden="true">
        {compactLabel}
      </span>
      <LineIcon name="arrow-right" />
      {status === "error" ? (
        <span className="visually-hidden" role="alert">
          Sign out could not complete. Try again.
        </span>
      ) : null}
    </button>
  );
};

export default AuthSessionAction;
