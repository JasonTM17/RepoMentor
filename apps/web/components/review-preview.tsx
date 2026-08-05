import type { FC, ReactElement } from "react";

import LineIcon from "@/components/line-icon";

type CodeTokenTone = "comment" | "keyword" | "property" | "string" | "type" | "plain";

interface CodeToken {
  readonly tone?: CodeTokenTone;
  readonly value: string;
}

interface CodeLine {
  readonly number: number;
  readonly signal?: boolean;
  readonly tokens: readonly CodeToken[];
}

const codeLines: readonly CodeLine[] = [
  {
    number: 8,
    tokens: [
      { tone: "keyword", value: "const" },
      { value: " lesson = (finding: " },
      { tone: "type", value: "Finding" },
      { value: " | null) => {" },
    ],
  },
  {
    number: 9,
    signal: true,
    tokens: [{ tone: "keyword", value: "  if" }, { value: " (!finding) {" }],
  },
  {
    number: 10,
    tokens: [
      { tone: "keyword", value: "    return" },
      { tone: "string", value: ' "No lesson yet"' },
      { value: ";" },
    ],
  },
  {
    number: 11,
    tokens: [{ value: "  }" }],
  },
  {
    number: 12,
    tokens: [{ value: "" }],
  },
  {
    number: 13,
    tokens: [{ tone: "keyword", value: "  return" }, { value: " {" }],
  },
  {
    number: 14,
    tokens: [{ tone: "property", value: "    title" }, { value: ": finding.title," }],
  },
  {
    number: 15,
    tokens: [{ tone: "property", value: "    nextStep" }, { value: ": finding.fix," }],
  },
  {
    number: 16,
    tokens: [{ value: "  };" }],
  },
  {
    number: 17,
    tokens: [{ value: "};" }],
  },
];

const CodeLineView: FC<{ readonly line: CodeLine }> = ({ line }) => (
  <span className={`code-line${line.signal ? " code-line-active" : ""}`}>
    <span className="code-line-number" aria-hidden="true">
      {line.number}
    </span>
    <span className="code-line-rail" aria-hidden="true">
      {line.signal ? <span className="signal-marker" /> : null}
    </span>
    <span className="code-line-content">
      {line.signal ? (
        <span className="visually-hidden">Review signal on line {line.number}. </span>
      ) : null}
      {line.tokens.map((token, tokenIndex) => (
        <span
          key={`${line.number}-${tokenIndex}`}
          className={`code-token code-token-${token.tone ?? "plain"}`}
        >
          {token.value}
        </span>
      ))}
    </span>
  </span>
);

const ReviewPreview: FC = (): ReactElement => (
  <article
    id="review-preview"
    className="review-preview surface-panel"
    aria-labelledby="review-preview-heading"
    aria-describedby="review-preview-note"
  >
    <header className="review-preview-header">
      <div>
        <p className="preview-overline">Review workspace</p>
        <h2 id="review-preview-heading" className="preview-title">
          Review context in one glance
        </h2>
      </div>
      <span className="status-label status-label-accent">Static preview</span>
    </header>

    <div className="review-file-bar" aria-label="Preview file context">
      <span className="review-file-name">src/reviews/lesson.ts</span>
      <span className="review-file-status">No repository connected</span>
    </div>

    <div className="review-body">
      <section className="code-pane" aria-labelledby="code-pane-heading">
        <h3 id="code-pane-heading" className="visually-hidden">
          Illustrative code preview
        </h3>
        <pre className="code-block" aria-label="Illustrative TypeScript code">
          <code>
            {codeLines.map((line) => (
              <CodeLineView key={line.number} line={line} />
            ))}
          </code>
        </pre>
      </section>

      <section className="analysis-pane" aria-labelledby="analysis-heading">
        <div className="analysis-header">
          <p className="analysis-overline">Illustrative review signal</p>
          <span className="status-label status-label-accent">Line 9</span>
        </div>
        <h3 id="analysis-heading" className="analysis-title">
          Keep the guard clause close to the input.
        </h3>
        <p className="analysis-copy">
          Returning early when a finding is absent keeps the learning path explicit and avoids
          reading properties from an empty value.
        </p>

        <div className="learning-signal" aria-labelledby="learning-signal-heading">
          <p id="learning-signal-heading" className="learning-signal-heading">
            <LineIcon name="book-open" />
            Learning signal
          </p>
          <p className="learning-signal-copy">
            Guard clauses turn an edge case into a named decision. The explanation can become a
            practice prompt later.
          </p>
        </div>

        <p id="review-preview-note" className="preview-note">
          Static preview only. No review data is loaded.
        </p>
      </section>
    </div>
  </article>
);

export default ReviewPreview;
