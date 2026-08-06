"use client";

import { useCallback, useEffect, useState } from "react";

import { createDemoUsageTransport } from "@/features/usage/api/demoUsageTransport";
import { getUsageErrorCopy } from "@/features/usage/helpers/usageHelpers";
import type { UsageOverviewData, UsageResourceState, UsageTransport } from "@/features/usage/types";

const demoTransport = createDemoUsageTransport();

const loadingState = (): UsageResourceState<UsageOverviewData> => ({
  data: null,
  errorMessage: null,
  status: "loading",
});

interface UseUsageOverviewResult extends UsageResourceState<UsageOverviewData> {
  readonly retry: () => void;
}

const useUsageOverview = (transport: UsageTransport = demoTransport): UseUsageOverviewResult => {
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<UsageResourceState<UsageOverviewData>>(loadingState);

  useEffect(() => {
    let isCurrent = true;
    setState(loadingState());

    void Promise.all([transport.getSummary(), transport.getQuota()])
      .then(([summary, quota]) => {
        if (isCurrent) {
          setState({ data: { quota, summary }, errorMessage: null, status: "success" });
        }
      })
      .catch(() => {
        if (isCurrent) {
          setState({ data: null, errorMessage: getUsageErrorCopy(), status: "error" });
        }
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

export default useUsageOverview;
