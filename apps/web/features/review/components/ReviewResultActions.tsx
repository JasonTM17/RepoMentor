"use client";

import { useCallback, useState } from "react";
import type { FC, ReactElement } from "react";

import LineIcon from "@/components/line-icon";
import { formatReviewJson, formatReviewMarkdown } from "@/features/review/helpers/reviewExports";
import type { ReviewOptionalResultData, ReviewResultResponse } from "@/features/review/types";

type FeedbackTone = "idle" | "success" | "error";

interface ReviewResultFeedback {
  readonly message: string;
  readonly tone: FeedbackTone;
}

interface ReviewResultActionsProps {
  readonly optionalData?: ReviewOptionalResultData | undefined;
  readonly result: ReviewResultResponse;
}

interface ClipboardLike {
  readonly writeText: (value: string) => Promise<void>;
}

interface BrowserAnchorLike {
  download: string;
  href: string;
  click: () => void;
}

interface BrowserDocumentLike {
  readonly createElement: (tagName: "a") => BrowserAnchorLike;
}

interface BrowserBlobConstructor {
  new (parts: readonly string[], options: { readonly type: string }): unknown;
}

interface BrowserUrlLike {
  readonly createObjectURL: (blob: unknown) => string;
  readonly revokeObjectURL: (objectUrl: string) => void;
}

interface BrowserGlobalLike {
  readonly Blob?: BrowserBlobConstructor;
  readonly URL?: BrowserUrlLike;
  readonly document?: BrowserDocumentLike;
  readonly navigator?: {
    readonly clipboard?: ClipboardLike;
  };
}

const ReviewResultActions: FC<ReviewResultActionsProps> = ({
  optionalData,
  result,
}): ReactElement => {
  const [feedback, setFeedback] = useState<ReviewResultFeedback>({ message: "", tone: "idle" });
  const improvedCode = optionalData?.improvedCode?.trim()
    ? optionalData.improvedCode
    : optionalData?.improvedSource?.trim()
      ? optionalData.improvedSource
      : undefined;
  const generatedTests = [
    ...(optionalData?.generatedTests ?? []).filter((value) => value.trim()),
    ...(optionalData?.generatedTest?.trim() ? [optionalData.generatedTest] : []),
  ];
  const generatedTest = generatedTests.length > 0 ? generatedTests.join("\n\n") : undefined;
  const diff = optionalData?.diff?.trim() ? optionalData.diff : undefined;

  const copyText = useCallback(async (label: string, value: string | undefined): Promise<void> => {
    const browser = globalThis as unknown as BrowserGlobalLike;

    if (!value || !browser.navigator?.clipboard) {
      setFeedback({ message: `${label} is unavailable.`, tone: "error" });
      return;
    }

    try {
      await browser.navigator.clipboard.writeText(value);
      setFeedback({ message: `${label} copied.`, tone: "success" });
    } catch {
      setFeedback({ message: `${label} could not be copied.`, tone: "error" });
    }
  }, []);

  const downloadText = useCallback(
    (fileName: string, content: string, contentType: string, label: string): void => {
      const browser = globalThis as unknown as BrowserGlobalLike;

      if (!browser.Blob || !browser.URL || !browser.document) {
        setFeedback({ message: `${label} is unavailable.`, tone: "error" });
        return;
      }

      try {
        const blob = new browser.Blob([content], { type: contentType });
        const objectUrl = browser.URL.createObjectURL(blob);
        const link = browser.document.createElement("a");
        link.href = objectUrl;
        link.download = fileName;
        link.click();
        globalThis.setTimeout(() => browser.URL?.revokeObjectURL(objectUrl), 0);
        setFeedback({ message: `${label} download started.`, tone: "success" });
      } catch {
        setFeedback({ message: `${label} could not be downloaded.`, tone: "error" });
      }
    },
    [],
  );

  return (
    <div className="review-result-actions">
      <span className="review-result-id">Review id: {result.id}</span>
      <div className="review-result-action-buttons">
        <button
          className="action-secondary review-result-action"
          type="button"
          onClick={() => void copyText("Improved code", improvedCode)}
          disabled={!improvedCode}
          aria-label={
            improvedCode
              ? "Copy improved code"
              : "Copy improved code unavailable because no improved code was supplied"
          }
        >
          Copy improved code
          <LineIcon name="code" />
        </button>
        <button
          className="action-secondary review-result-action"
          type="button"
          onClick={() => void copyText("Test case", generatedTest)}
          disabled={!generatedTest}
          aria-label={
            generatedTest
              ? "Copy test case"
              : "Copy test case unavailable because no generated test was supplied"
          }
        >
          Copy test case
          <LineIcon name="code" />
        </button>
        <button
          className="action-secondary review-result-action"
          type="button"
          onClick={() => void copyText("Unified diff", diff)}
          disabled={!diff}
          aria-label={
            diff
              ? "Copy unified diff"
              : "Copy unified diff unavailable because no diff was supplied"
          }
        >
          Copy diff
          <LineIcon name="code" />
        </button>
        <button
          className="action-secondary review-result-action"
          type="button"
          onClick={() =>
            downloadText(
              "review-result.md",
              formatReviewMarkdown(result, optionalData),
              "text/markdown;charset=utf-8",
              "Markdown",
            )
          }
        >
          Download Markdown
          <LineIcon name="arrow-down" />
        </button>
        <button
          className="action-secondary review-result-action"
          type="button"
          onClick={() =>
            downloadText(
              "review-result.json",
              formatReviewJson(result, optionalData),
              "application/json;charset=utf-8",
              "JSON",
            )
          }
        >
          Download JSON
          <LineIcon name="arrow-down" />
        </button>
      </div>
      <p
        className={`review-result-action-feedback review-result-action-feedback-${feedback.tone}`}
        role="status"
        aria-live="polite"
      >
        {feedback.message}
      </p>
    </div>
  );
};

export default ReviewResultActions;
