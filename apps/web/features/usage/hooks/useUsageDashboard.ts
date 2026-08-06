"use client";

import { useCallback, useEffect, useState } from "react";

import { createDemoUsageTransport } from "@/features/usage/api/demoUsageTransport";
import { getUsageErrorCopy } from "@/features/usage/helpers/usageHelpers";
import type {
  UsageDashboardData,
  UsageResourceState,
  UsageTransport,
} from "@/features/usage/types";

const demoTransport = createDemoUsageTransport();

const loadingState = (): UsageResourceState<UsageDashboardData> => ({
  data: null,
  errorMessage: null,
  status: "loading",
});

interface UseUsageDashboardResult extends UsageResourceState<UsageDashboardData> {
  readonly retry: () => void;
}

const useUsageDashboard = (transport: UsageTransport = demoTransport): UseUsageDashboardResult => {
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<UsageResourceState<UsageDashboardData>>(loadingState);

  useEffect(() => {
    let isCurrent = true;
    setState(loadingState());

    void Promise.all([
      transport.getSummary(),
      transport.getHistory({ limit: 5, page: 1 }),
      transport.getQuota(),
    ])
      .then(([summary, history, quota]) => {
        if (!isCurrent) {
          return;
        }

        setState({ data: { history, quota, summary }, errorMessage: null, status: "success" });
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }

        setState({ data: null, errorMessage: getUsageErrorCopy(), status: "error" });
      });

    return () => {
      isCurrent = false;
    };
  }, [requestVersion, transport]);

  const retry = useCallback((): void => {
    setRequestVersion((current) => current + 1);
  }, []);

  return { ...state, retry };
};

export default useUsageDashboard;
