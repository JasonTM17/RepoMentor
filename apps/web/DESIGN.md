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

- [x] Skip link lands on the page's `main` landmark.
- [x] Header navigation uses real anchors only for sections present in this phase.
- [x] All links and buttons have visible hover, active, disabled or loading treatment where the state exists, and `:focus-visible` treatment.
- [x] Touch targets are at least 44px in both dimensions. Body inputs, if added later, must remain at least 16px.
- [x] The static preview is explicitly labeled as static and contains no network or fabricated product data.
- [x] Empty-state language says `No reviews yet` or equivalent instead of inventing metrics.
- [x] Error and loading boundaries retain the same shell, use semantic status roles, and keep content visible without animation.
- [x] Color is not the only carrier of meaning. Line labels and text accompany the orange signal.
- [x] Decorative SVGs are hidden from assistive technology. Heading order and landmark labels remain semantic.
- [x] Reduced motion disables non-essential transitions and preserves immediate content visibility.
- [x] Copy contains no em-dash and avoids generic AI marketing language.

## Phase 08 review workspace evidence

### Direction continuity

Phase 08 keeps the existing Industrial / utilitarian direction. The seeded read in this document already selected that direction for a developer review console, and the new surface extends its code-gutter motif into an editor, status rail, and ruled result desk. The palette, Barlow Condensed display face, Source Sans 3 body face, hairline depth strategy, restrained radius system, and LineIcon family remain shared with the shell.

### Product surface

- `/reviews/new` is a real client-side workspace with source, language, learner level, review mode, title, and context inputs.
- Character, line, and rough token values are computed from the local source and labeled as estimates. They are not quota or provider usage.
- Validation runs on blur and submit. Errors are connected below their fields with `aria-describedby` and `role="alert"`.
- The result desk renders summary, an explicit `Score not supplied` boundary, issue signals, severity/category filters, source line highlights, learning notes, copy action, and safe execution metadata.
- The result reader preserves the accepted response fields: `summary`, `findings`, `provider`, `model`, `reasoningEffort`, `attempts`, `durationMs`, and nullable `usage`.

### State contract

| UI state   | Visible behavior                                                        | Truth boundary                                        |
| ---------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| Idle       | Draft form and empty result panel                                       | No review is implied                                  |
| Loading    | Stable result panel with preparation copy and skeleton lines            | No blank spinner or fake progress                     |
| Processing | Stable result panel with bounded processing copy                        | No fabricated percentage, quota, or token count       |
| Success    | Structured summary, findings, filters, line context, and learning notes | Demo result is labeled deterministic fixture          |
| Empty      | Empty finding list copy and empty result panel                          | Empty means no finding signals, not a missing request |
| Error      | Generic alert and retry action                                          | Raw API/provider errors do not reach visible copy     |

### Transport bridge

`features/review/api/reviewApi.ts` is the integration seam for the accepted backend transport. It sends an empty object to `POST /api/v1/reviews/:id/process`, reads `GET /api/v1/reviews/:id/result`, includes credentials, validates the success envelope and response shape, and maps failures to a safe client error. The route currently injects the deterministic demo factory because browser auth/session and review creation are not connected in this phase. Title, context, and learner level therefore remain UI-only context and are not sent to a server contract that does not accept them.

The demo fixture uses the server's `gpt-5.6-luna` and `max` metadata shape without making a provider call. It uses fixed output and a fixed completion timestamp, reports `usage: null`, and is explicitly labeled on the page. Adding `no findings` to the local source exercises the empty fixture path.

### Verification evidence

- Static shell/UI contract: 22 tests passed, including exact endpoint/body checks, state copy, result sections, focus/target CSS, responsive rules, reduced motion, and banned-copy checks.
- `pnpm --filter @repomentor/web lint`: passed.
- `pnpm --filter @repomentor/web typecheck`: passed.
- `pnpm --filter @repomentor/web build`: passed. The build generated `/reviews/new` as a static route.
- Prettier check and `git diff --check`: passed.
- Browser QA ran against the local production build at 375px and 1440px. Both sizes had no horizontal overflow. The 375px grid composed to one column; the 1440px editor/sidebar grid measured approximately 748.8px and 403.2px. The demo run was exercised through processing into the structured result.
- Screenshots were transient QA evidence only and are not checked in. No live AI, authenticated session, PostgreSQL, Redis, or provider integration was claimed.

## Visual-QA limitations

The implementation will be checked with a production build, static HTML inspection, a 375px viewport check for overflow, and a desktop composition check. This environment does not provide a checked-in screenshot baseline or live backend data, so visual QA cannot validate authenticated routes, repository-specific code, real review findings, network-loaded font behavior under offline conditions, or future editor interactions. The preview is intentionally an illustrative static surface and is labeled accordingly.
