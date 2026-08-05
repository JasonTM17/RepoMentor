# RepoMentor visual foundation

## Design Read

Reading this as: a product application shell for developers and learners, with a precise utilitarian language, leaning industrial/utilitarian product console.

## Seeded variation

The seed source is `RepoMentor|Phase 02|developer review shell|code line gutter|review signal`. The seed is the sum of its Unicode code points, `7276`. Using the ten-row direction menu, `(7276 % 10) + 1 = 7`, which selects Industrial / utilitarian. The seeded direction is a direct fit for a developer review console, so no adjacent-row deviation is needed. The selected hero archetype is a split utility desk. The component patterns are a line-number review rail, a dense two-column console, and ruled status panels.

## Aesthetic thesis

Industrial/utilitarian RepoMentor for developers and learners: cool concrete, paper, ink, ember orange, and restrained slate; condensed display type, humanist body type, a flush-left split-console layout, and a line-gutter rail that carries review signals.

The form comes from code editor gutters and the small signals reviewers leave beside a changed line. Orange is rare and functional: it marks the review signal and the primary action, while the tinted neutral field does the everyday work of the product surface.

## Direction decisions

- **Direction:** Industrial / utilitarian product console. This is a working application shell, so hierarchy, density, and dependable rules matter more than a marketing-hero treatment.
- **Palette:** A cool blue-gray neutral ramp creates a paper-like editor canvas without falling into a warm cream default. Deep ink carries text. Safety orange marks attention, review, and the one primary action.
- **Type:** Barlow Condensed is the display face for a deliberately narrow, tool-like voice. Source Sans 3 is the humanist body face for readable explanations and controls. Both families are loaded from Google Fonts with Vietnamese coverage and local generic fallbacks.
- **Layout:** Left-aligned copy and an asymmetric split create a utility-desk composition. Hairline rules expose the information architecture. The review preview stacks into one readable column below the mobile breakpoint.
- **Memorable element:** A vertical code-line gutter runs through the static workspace preview, with a single orange review rail linking the changed line to the learning signal.

## Token map

The implementation keeps visual decisions in `app/globals.css`. Components consume semantic class names instead of inventing one-off values.

| Token group | Semantic tokens                                                                        | Use                                                     |
| ----------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Color       | `--color-canvas`, `--color-surface`, `--color-surface-muted`, `--color-surface-strong` | Page field and elevation by tint                        |
| Color       | `--color-ink`, `--color-ink-strong`, `--color-ink-muted`, `--color-ink-faint`          | Body, headings, supporting text, metadata               |
| Color       | `--color-line`, `--color-line-strong`                                                  | The single hairline depth strategy                      |
| Color       | `--color-accent`, `--color-accent-strong`, `--color-accent-soft`                       | Rare review signal and primary action                   |
| Color       | `--color-danger`, `--color-focus`, `--color-selection`                                 | Error state, keyboard focus, text selection             |
| Type        | `--font-display`, `--font-body`, `--text-xs` through `--text-display`                  | Two-family type system and fixed product scale          |
| Spacing     | `--space-1` through `--space-9`                                                        | 4 / 8 rhythm: 4, 8, 12, 16, 24, 32, 48, 64, 96px        |
| Shape       | `--radius-control`, `--radius-panel`                                                   | One restrained soft-corner system                       |
| Depth       | `--depth-rule`                                                                         | Hairline borders only, with no shadows                  |
| Focus       | `--focus-width`, `--focus-offset`                                                      | Visible 3px focus ring outside controls                 |
| Motion      | `--duration-quick`, `--duration-standard`, `--ease-out-quart`                          | State feedback without `transition: all`                |
| Layout      | `--content-max`, `--header-height`, `--measure-copy`                                   | Stable shell width, navigation height, readable measure |

## Interaction, state, and accessibility checklist

- [ ] Skip link lands on the page's `main` landmark.
- [ ] Header navigation uses real anchors only for sections present in this phase.
- [ ] All links and buttons have visible hover, active, disabled or loading treatment where the state exists, and `:focus-visible` treatment.
- [ ] Touch targets are at least 44px in both dimensions. Body inputs, if added later, must remain at least 16px.
- [ ] The static preview is explicitly labeled as static and contains no network or fabricated product data.
- [ ] Empty-state language says `No reviews yet` or equivalent instead of inventing metrics.
- [ ] Error and loading boundaries retain the same shell, use semantic status roles, and keep content visible without animation.
- [ ] Color is not the only carrier of meaning. Line labels and text accompany the orange signal.
- [ ] Decorative SVGs are hidden from assistive technology. Heading order and landmark labels remain semantic.
- [ ] Reduced motion disables non-essential transitions and preserves immediate content visibility.
- [ ] Copy contains no em-dash and avoids generic AI marketing language.

## Visual-QA limitations

The implementation will be checked with a production build, static HTML inspection, a 375px viewport check for overflow, and a desktop composition check. This environment does not provide a checked-in screenshot baseline or live backend data, so visual QA cannot validate authenticated routes, repository-specific code, real review findings, network-loaded font behavior under offline conditions, or future editor interactions. The preview is intentionally an illustrative static surface and is labeled accordingly.
