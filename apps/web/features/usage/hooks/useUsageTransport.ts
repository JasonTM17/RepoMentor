"use client";

import { useMemo } from "react";

import { getAccessToken } from "@/features/auth/api/authClient";
import { useAuthSession, useInitializeAuthSession } from "@/features/auth/authSession";
import { createDemoUsageTransport } from "@/features/usage/api/demoUsageTransport";
import { createUsageApiTransport } from "@/features/usage/api/usageApi";
import type { UsageTransport } from "@/features/usage/types";

const useUsageTransport = (transportOverride?: UsageTransport): UsageTransport => {
  useInitializeAuthSession();
  const { accessToken } = useAuthSession();

  return useMemo(() => {
    if (transportOverride) {
      return transportOverride;
    }

    return accessToken ? createUsageApiTransport({ getAccessToken }) : createDemoUsageTransport();
  }, [accessToken, transportOverride]);
};

export default useUsageTransport;
