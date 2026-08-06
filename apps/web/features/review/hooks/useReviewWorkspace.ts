"use client";

import { useCallback, useRef, useState } from "react";

import {
  DEMO_REVIEW_ID,
  createDemoReviewTransport,
} from "@/features/review/api/demoReviewTransport";
import type {
  ReviewDraft,
  ReviewResultResponse,
  ReviewStatus,
  ReviewTransportFactory,
} from "@/features/review/types";

export interface UseReviewWorkspaceResult {
  readonly errorMessage: string | null;
  readonly lastDraft: ReviewDraft | null;
  readonly result: ReviewResultResponse | null;
  readonly status: ReviewStatus;
  readonly reset: () => void;
  readonly retry: () => Promise<boolean>;
  readonly startReview: (draft: ReviewDraft) => Promise<boolean>;
}

const safeErrorMessage =
  "The review could not be completed in this workspace. Try again or inspect the transport boundary.";

export const useReviewWorkspace = (
  transportFactory: ReviewTransportFactory = createDemoReviewTransport,
): UseReviewWorkspaceResult => {
  const requestVersion = useRef(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastDraft, setLastDraft] = useState<ReviewDraft | null>(null);
  const [result, setResult] = useState<ReviewResultResponse | null>(null);
  const [status, setStatus] = useState<ReviewStatus>("idle");

  const startReview = useCallback(
    async (draft: ReviewDraft): Promise<boolean> => {
      const currentVersion = requestVersion.current + 1;
      requestVersion.current = currentVersion;
      setErrorMessage(null);
      setLastDraft(draft);
      setResult(null);
      setStatus("loading");

      try {
        const transport = transportFactory(draft);

        await Promise.resolve();

        if (requestVersion.current !== currentVersion) {
          return false;
        }

        setStatus("processing");
        const processResponse = await transport.process(DEMO_REVIEW_ID);

        if (requestVersion.current !== currentVersion) {
          return false;
        }

        if (!processResponse.resultAvailable) {
          setStatus("processing");
        }

        const resultResponse = await transport.getResult(processResponse.id);

        if (requestVersion.current !== currentVersion) {
          return false;
        }

        setResult(resultResponse);
        setStatus(resultResponse.result.findings.length === 0 ? "empty" : "success");
        return true;
      } catch {
        if (requestVersion.current !== currentVersion) {
          return false;
        }

        setStatus("error");
        setErrorMessage(safeErrorMessage);
        return false;
      }
    },
    [transportFactory],
  );

  const reset = useCallback((): void => {
    requestVersion.current += 1;
    setErrorMessage(null);
    setLastDraft(null);
    setResult(null);
    setStatus("idle");
  }, []);

  const retry = useCallback((): Promise<boolean> => {
    if (!lastDraft) {
      return Promise.resolve(false);
    }

    return startReview(lastDraft);
  }, [lastDraft, startReview]);

  return { errorMessage, lastDraft, reset, result, retry, startReview, status };
};

export default useReviewWorkspace;
