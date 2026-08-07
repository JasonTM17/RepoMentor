"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEMO_REVIEW_ID,
  createDemoReviewTransport,
} from "@/features/review/api/demoReviewTransport";
import { getReviewResultWithPolling } from "@/features/review/helpers/reviewPolling";
import type {
  ReviewDraft,
  ReviewResultResponse,
  ReviewStatus,
  ReviewStreamOutcome,
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
  const activeStreamAbort = useRef<AbortController | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastDraft, setLastDraft] = useState<ReviewDraft | null>(null);
  const [result, setResult] = useState<ReviewResultResponse | null>(null);
  const [status, setStatus] = useState<ReviewStatus>("idle");

  const startReview = useCallback(
    async (draft: ReviewDraft): Promise<boolean> => {
      activeStreamAbort.current?.abort();
      const currentVersion = requestVersion.current + 1;
      requestVersion.current = currentVersion;
      setErrorMessage(null);
      setLastDraft(draft);
      setResult(null);
      setStatus("loading");
      const streamAbort = new AbortController();
      activeStreamAbort.current = streamAbort;

      try {
        const transport = transportFactory(draft);

        await Promise.resolve();

        if (requestVersion.current !== currentVersion) {
          return false;
        }

        setStatus("processing");
        let streamPromise: Promise<ReviewStreamOutcome> | undefined;
        if (transport.stream) {
          try {
            streamPromise = transport.stream(DEMO_REVIEW_ID, { signal: streamAbort.signal });
          } catch {
            streamPromise = undefined;
          }
        }
        const processResponse = await transport.process(DEMO_REVIEW_ID);

        if (requestVersion.current !== currentVersion) {
          return false;
        }

        let resultResponse: ReviewResultResponse;

        if (processResponse.resultAvailable) {
          resultResponse = await transport.getResult(processResponse.id);
        } else {
          let streamOutcome: ReviewStreamOutcome | undefined;
          if (streamPromise) {
            try {
              streamOutcome = await streamPromise;
            } catch {
              streamOutcome = undefined;
            }
          }

          if (streamOutcome?.kind === "terminal") {
            if (streamOutcome.event.status !== "COMPLETED") {
              if (requestVersion.current !== currentVersion) {
                return false;
              }

              setStatus("error");
              setErrorMessage(safeErrorMessage);
              return false;
            }

            resultResponse = await transport.getResult(processResponse.id);
          } else {
            const pollingOutcome = await getReviewResultWithPolling(transport, processResponse.id, {
              isCurrent: () => requestVersion.current === currentVersion,
            });

            if (pollingOutcome.kind === "cancelled") {
              return false;
            }

            if (pollingOutcome.kind === "processing") {
              if (requestVersion.current !== currentVersion) {
                return false;
              }

              setStatus("processing");
              return false;
            }

            resultResponse = pollingOutcome.response;
          }
        }

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
      } finally {
        if (activeStreamAbort.current === streamAbort) {
          activeStreamAbort.current = null;
        }
        streamAbort.abort();
      }
    },
    [transportFactory],
  );

  useEffect(() => {
    return () => {
      requestVersion.current += 1;
      activeStreamAbort.current?.abort();
      activeStreamAbort.current = null;
    };
  }, []);

  const reset = useCallback((): void => {
    requestVersion.current += 1;
    activeStreamAbort.current?.abort();
    activeStreamAbort.current = null;
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
