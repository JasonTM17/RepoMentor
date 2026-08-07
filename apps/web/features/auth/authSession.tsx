"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  getAuthSessionSnapshot,
  refreshAccessToken,
  subscribeAuthSession,
} from "@/features/auth/api/authClient";
import type { AuthSessionSnapshot } from "@/features/auth/api/authClient";

const emptyServerSnapshot: AuthSessionSnapshot = Object.freeze({});

export const useAuthSession = () =>
  useSyncExternalStore(subscribeAuthSession, getAuthSessionSnapshot, () => emptyServerSnapshot);

export const useInitializeAuthSession = (): void => {
  useEffect(() => {
    void refreshAccessToken();
  }, []);
};
