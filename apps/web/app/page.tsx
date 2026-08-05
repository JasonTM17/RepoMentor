import type { ReactElement } from "react";

import LineIcon, { type LineIconName } from "@/components/line-icon";
import ReviewPreview from "@/components/review-preview";

interface LearningStep {
  readonly description: string;
  readonly icon: LineIconName;
  readonly index: string;
  readonly title: string;
}

interface StatusItem {
  readonly label: string;
  readonly value: string;
}

const learningSteps: readonly LearningStep[] = [
  {
    description: "Read the trade-off behind a review comment before you touch the code.",
    icon: "code",
    index: "01",
    title: "See the reasoning",
  },
  {
    description: "Choose a next move with an explanation that stays close to the changed line.",
    icon: "arrow-right",
    index: "02",
    title: "Apply the idea",
  },
  {
    description: "Keep the important principle visible so the next review starts further ahead.",
    icon: "book-open",
    index: "03",
    title: "Keep the lesson",
  },
];

const statusItems: readonly StatusItem[] = [
  { label: "Current surface", value: "Static application shell" },
  { label: "Review data", value: "No reviews yet" },
  { label: "Next connection", value: "Connects in the next phase" },
];

const HomePage = (): ReactElement => (
  <main id="main-content" className="home-main">
    <section className="hero-section shell-container" aria-labelledby="hero-heading">
      <div className="hero-copy">
        <p className="section-kicker">Developer review workspace</p>
        <h1 id="hero-heading" className="hero-title">
          Read the change before you <span className="hero-title-emphasis">ship it.</span>
        </h1>
        <p className="hero-lede">
          RepoMentor turns code review into plain-language guidance and practice prompts, so
          developers can improve the next change with context.
        </p>
        <div className="hero-actions">
          <a className="action-primary" href="#review-preview">
            Review workspace
            <LineIcon name="arrow-up-right" />
          </a>
          <a className="action-secondary" href="#learning-loop">
            See the approach
            <LineIcon name="arrow-down" />
          </a>
        </div>
      </div>

      <ReviewPreview />
    </section>

    <section
      id="learning-loop"
      className="learning-section shell-container"
      aria-labelledby="learning-heading"
    >
      <div className="section-heading">
        <h2 id="learning-heading" className="section-title">
          Feedback should leave a trail.
        </h2>
        <p className="section-copy">
          A review becomes a learning loop when the reason, the next move, and the lesson stay close
          together.
        </p>
      </div>

      <div className="learning-layout">
        <ol className="learning-list" aria-label="RepoMentor learning loop">
          {learningSteps.map((step) => (
            <li key={step.index} className="learning-step">
              <span className="learning-step-index" aria-hidden="true">
                {step.index}
              </span>
              <div>
                <h3 className="learning-step-title">{step.title}</h3>
                <p className="learning-step-copy">{step.description}</p>
              </div>
              <span className="learning-step-icon" aria-hidden="true">
                <LineIcon name={step.icon} />
              </span>
            </li>
          ))}
        </ol>

        <aside className="empty-state state-panel" aria-labelledby="empty-heading">
          <span className="status-label">No reviews yet</span>
          <h3 id="empty-heading" className="empty-state-title">
            Start with a real change.
          </h3>
          <p className="empty-state-copy">
            When review data is connected, this space will hold the next lesson instead of invented
            activity.
          </p>
          <p className="empty-state-note">Connects in the next phase.</p>
        </aside>
      </div>
    </section>

    <section
      id="status"
      className="status-section shell-container"
      aria-labelledby="status-heading"
    >
      <div className="status-frame surface-panel">
        <div className="status-intro">
          <span className="status-label status-label-accent">Current boundary</span>
          <h2 id="status-heading" className="status-title">
            No reviews yet. The workspace is ready.
          </h2>
          <p className="status-copy">
            This phase establishes the visual language for the editor and review routes that follow.
            It does not call an API or imply connected repository data.
          </p>
        </div>

        <dl className="status-list">
          {statusItems.map((item) => (
            <div key={item.label} className="status-item">
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  </main>
);

export default HomePage;
