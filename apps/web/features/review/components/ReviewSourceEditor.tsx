"use client";

import dynamic from "next/dynamic";
import { Component } from "react";
import type { FC, ReactElement, ReactNode } from "react";
import type { DiffEditorProps, EditorProps } from "@monaco-editor/react";

import { getMonacoLanguage } from "@/features/review/helpers/reviewHelpers";
import type { ReviewLanguage } from "@/features/review/types";

interface TextareaValueTarget {
  readonly value: string;
}

const MonacoEditor = dynamic<EditorProps>(
  () => import("@monaco-editor/react").then((module) => module.default),
  {
    loading: () => <MonacoLoadingState label="Loading source editor" />,
    ssr: false,
  },
);

const MonacoDiffEditor = dynamic<DiffEditorProps>(
  () => import("@monaco-editor/react").then((module) => module.DiffEditor),
  {
    loading: () => <MonacoLoadingState label="Loading comparison editor" />,
    ssr: false,
  },
);

interface MonacoErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback: ReactElement;
}

interface MonacoErrorBoundaryState {
  readonly hasError: boolean;
}

class MonacoErrorBoundary extends Component<MonacoErrorBoundaryProps, MonacoErrorBoundaryState> {
  public override readonly state: MonacoErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): MonacoErrorBoundaryState {
    return { hasError: true };
  }

  public override render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

const MonacoLoadingState: FC<{ readonly label: string }> = ({ label }): ReactElement => (
  <div className="review-monaco-state review-monaco-state-loading" role="status" aria-live="polite">
    <span className="status-label">Editor loading</span>
    <p>{label}. The source stays local to this page.</p>
  </div>
);

const MonacoUnavailableState: FC = (): ReactElement => (
  <div className="review-monaco-state review-monaco-state-error" role="alert">
    <span className="status-label">Editor unavailable</span>
    <p>The comparison editor is unavailable in this browser. The optional diff is not shown.</p>
  </div>
);

export interface ReviewSourceEditorProps {
  readonly describedBy: string;
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly labelId: string;
  readonly language: ReviewLanguage;
  readonly onBlur: () => void;
  readonly onChange: (value: string) => void;
  readonly value: string;
}

type ReviewSourceTextareaFallbackProps = Omit<ReviewSourceEditorProps, "language">;

const ReviewSourceTextareaFallback: FC<ReviewSourceTextareaFallbackProps> = ({
  describedBy,
  disabled,
  invalid,
  labelId,
  onBlur,
  onChange,
  value,
}): ReactElement => (
  <div className="review-monaco-fallback" data-editor-fallback="textarea">
    <div className="review-monaco-state review-monaco-state-error" role="alert">
      <span className="status-label">Editor unavailable</span>
      <p>Monaco could not load. Continue with the accessible source field below.</p>
    </div>
    <textarea
      className="review-input review-source-input review-source-fallback"
      aria-describedby={describedBy}
      aria-invalid={invalid ? "true" : undefined}
      aria-labelledby={labelId}
      disabled={disabled}
      onBlur={onBlur}
      onChange={(event) => onChange((event.target as unknown as TextareaValueTarget).value)}
      required
      rows={18}
      spellCheck={false}
      value={value}
    />
  </div>
);

const ReviewSourceEditor: FC<ReviewSourceEditorProps> = ({
  describedBy,
  disabled,
  invalid,
  labelId,
  language,
  onBlur,
  onChange,
  value,
}): ReactElement => (
  <div className="review-monaco-viewport" data-editor-engine="monaco">
    <MonacoErrorBoundary
      fallback={
        <ReviewSourceTextareaFallback
          describedBy={describedBy}
          disabled={disabled}
          invalid={invalid}
          labelId={labelId}
          onBlur={onBlur}
          onChange={onChange}
          value={value}
        />
      }
    >
      <MonacoEditor
        className="review-monaco-editor"
        height="100%"
        language={getMonacoLanguage(language)}
        loading={<MonacoLoadingState label="Loading source editor" />}
        onChange={(nextValue) => onChange(nextValue ?? "")}
        options={{
          ariaLabel: "Source code to review",
          ariaRequired: true,
          automaticLayout: true,
          lineNumbers: "on",
          minimap: { enabled: false },
          padding: { bottom: 16, top: 16 },
          readOnly: disabled,
          scrollBeyondLastLine: false,
          tabSize: 2,
          wordWrap: "on",
        }}
        theme="light"
        value={value}
        wrapperProps={{
          "aria-describedby": describedBy,
          "aria-invalid": invalid ? "true" : "false",
          "aria-labelledby": labelId,
          "data-editor-state": disabled ? "disabled" : "ready",
          onBlur,
          role: "textbox",
        }}
      />
    </MonacoErrorBoundary>
  </div>
);

export interface ReviewDiffEditorProps {
  readonly describedBy?: string;
  readonly language: ReviewLanguage;
  readonly modified: string;
  readonly original: string;
}

export const ReviewDiffEditor: FC<ReviewDiffEditorProps> = ({
  describedBy,
  language,
  modified,
  original,
}): ReactElement => (
  <div className="review-monaco-diff-viewport" data-editor-engine="monaco-diff">
    <MonacoErrorBoundary fallback={<MonacoUnavailableState />}>
      <MonacoDiffEditor
        className="review-monaco-diff-editor"
        height="100%"
        language={getMonacoLanguage(language)}
        loading={<MonacoLoadingState label="Loading comparison editor" />}
        modified={modified}
        options={{
          ariaLabel: "Original and improved code comparison",
          automaticLayout: true,
          minimap: { enabled: false },
          originalEditable: false,
          padding: { bottom: 16, top: 16 },
          renderSideBySide: true,
          scrollBeyondLastLine: false,
          wordWrap: "on",
        }}
        original={original}
        theme="light"
        wrapperProps={{
          "aria-describedby": describedBy,
          "aria-label": "Original and improved code comparison",
          "data-editor-state": "ready",
        }}
      />
    </MonacoErrorBoundary>
  </div>
);

export default ReviewSourceEditor;
