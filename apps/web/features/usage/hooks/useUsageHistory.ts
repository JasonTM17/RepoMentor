"use client";

import { useCallback, useEffect, useState } from "react";

import { createDemoUsageTransport } from "@/features/usage/api/demoUsageTransport";
import { getUsageErrorCopy } from "@/features/usage/helpers/usageHelpers";
import type { UsageHistoryData, UsageResourceState, UsageTransport } from "@/features/usage/types";

const demoTransport = createDemoUsageTransport();

const loadingState = (): UsageResourceState<UsageHistoryData> => ({
  data: null,
  errorMessage: null,
  status: "loading",
});

interface UseUsageHistoryResult extends UsageResourceState<UsageHistoryData> {
  readonly retry: () => void;
}

const useUsageHistory = (
  page: number,
  limit: number,
  transport: UsageTransport = demoTransport,
): UseUsageHistoryResult => {
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<UsageResourceState<UsageHistoryData>>(loadingState);

  useEffect(() => {
    let isCurrent = true;
    setState(loadingState());

    void transport
      .getHistory({ limit, page })
      .then((data) => {
        if (isCurrent) {
          setState({ data, errorMessage: null, status: "success" });
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
  }, [limit, page, requestVersion, transport]);

  const retry = useCallback((): void => {
    setRequestVersion((current) => current + 1);
  }, []);

  return { ...state, retry };
};

export default useUsageHistory;
