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
- Source input uses a client-only Monaco editor with a stable loading state, generic unavailable state, accessible label/help/error wiring, and read-only treatment while the bounded run is active.
- The language select covers the initial ten-language set: JavaScript, TypeScript, Java, Python, Go, SQL, C#, C++, Rust, and Other. Demo fixture filenames map each option to a deterministic extension.
- Character and line counts are computed from the local source. No token estimate is shown in the review workspace.
- Validation runs on blur and submit. Errors are connected below their fields with `aria-describedby` and `role="alert"`.
- The result desk renders summary, an explicit `Score not supplied` boundary, issue signals, severity/category filters, keyboard-reachable line selection, source line highlights, learning notes, optional improved code/test/question/diff views, and user-triggered copy/download actions.
- The accepted transport response shape remains validated at the API seam, but provider, model, reasoning, duration, and usage fields are not rendered by the result reader. Optional result views use a separate UI seam and are not added to the live contract or demo fixture.

### State contract

| UI state   | Visible behavior                                                                 | Truth boundary                                        |
| ---------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Idle       | Draft form and empty result panel                                                | No review is implied                                  |
| Loading    | Stable result panel with preparation copy and skeleton lines                     | No blank spinner or fake progress                     |
| Processing | Stable result panel with bounded processing copy and a `Check for result` action | No fabricated percentage, quota, or token count       |
| Success    | Structured summary, findings, filters, line context, and learning notes          | Demo result is labeled deterministic fixture          |
| Empty      | Empty finding list copy and empty result panel                                   | Empty means no finding signals, not a missing request |
| Error      | Generic alert and retry action                                                   | Raw API/provider errors do not reach visible copy     |

### Transport bridge

`features/review/api/reviewApi.ts` is the integration seam for the accepted backend transport. It sends an empty object to `POST /api/v1/reviews/:id/process`, reads `GET /api/v1/reviews/:id/result`, includes credentials, validates the success envelope and response shape, and maps failures to a safe client error. The route currently injects the deterministic demo factory because browser auth/session and review creation are not connected in this phase. Title, context, and learner level therefore remain UI-only context and are not sent to a server contract that does not accept them.

When process returns `resultAvailable: false` with `ALREADY_PROCESSING`, the hook keeps the result panel in `processing` and checks the result endpoint at most four times. It retries only the expected HTTP 409 conflict (`CONFLICT`, or the more specific `RESULT_NOT_READY` code), waits between checks, and returns to the visible processing state when the bounded window ends. A newer request, reset, or unmount invalidates the request version and cancels further checks. Other transport failures enter the generic error state. The processing panel exposes `Check for result`, while the result remains empty until the transport returns a validated completed payload.

Learning-note headings use the rendered finding index for unique DOM IDs, and React keys include that index so duplicate `filePath` and line references remain addressable. The result validator also requires an ISO date-time completion value, non-negative integer usage, additive totals, a bounded cached-input value, and strict known-key sets.

The demo fixture uses the server's `gpt-5.6-luna` and `max` metadata shape without making a provider call. It uses fixed output and a fixed completion timestamp, reports `usage: null`, and is explicitly labeled on the page. Adding `no findings` to the local source exercises the empty fixture path.

## Review experience extension

### Design Read and decision procedure

- Reading this as: the existing product review workbench for learners and reviewers, with an industrial code-inspection language and a result desk that must stay honest at the demo boundary.
- Seeded variation: the request key `review-experience` has 17 characters. `17 mod 10 = 7` selects Industrial / utilitarian in the ten-row direction menu. The selection is a direct fit for the established RepoMentor shell, so no adjacent-row deviation is needed.
- Aesthetic thesis: industrial/utilitarian for RepoMentor learners, cool concrete neutrals with restrained safety orange, condensed technical labels with readable body text, a split editor/result workbench, and an interactive source gutter that turns issue selection into a visible line trace.
- The form comes from code editor gutters and reviewer annotations beside a changed line. Monaco carries the source-editing behavior, while the existing hairline rules, Barlow Condensed display face, Source Sans 3 body face, and LineIcon family remain unchanged.

### Product and data boundary

- Monaco and the DiffEditor are dynamically loaded on the client only. Loading and error states are visible, generic, and do not expose loader details or source content. If Monaco cannot load, the source field keeps an accessible native textarea fallback so draft entry remains available.
- Issue location buttons are native keyboard controls with `aria-pressed` state and `aria-controls` linkage. Selecting an issue colors only the referenced source window, and the visible window moves to a selected line when it falls beyond the first 24 lines.
- Improved code, generated test, learning question, and original-versus-improved diff sections render supplied optional data. Each renders `Not supplied` when its value is absent. The current deterministic fixture supplies none of these optional values.
- Copy actions require supplied optional code/test values. Markdown and JSON downloads contain the result contract plus explicitly supplied optional data, omit execution metadata, and run only from the user-triggered browser action.
- Score remains `Not supplied`; the review result surface does not invent tokens, provider calls, quotas, or metrics.

### Verification evidence

- Static and runtime shell/UI contract: 37 tests passed, including bounded conflict polling, request-version cancellation, duplicate-safe learning-note IDs, strict result timestamp/usage validation, the ten-language option set, exact endpoint/body checks, state copy, result sections, export parity, the native editor fallback, focus/target CSS, responsive rules, reduced motion, and banned-copy checks.
- `pnpm --filter @repomentor/web lint`: passed.
- `pnpm --filter @repomentor/web typecheck`: passed.
- `pnpm --filter @repomentor/web build`: passed. The build generated `/reviews/new` as a static route.
- Prettier check and `git diff --check`: passed.
- Browser QA captured the local production build at 375px and 1440px output sizes. The available headless Chrome reports a 500px CSS `innerWidth` minimum even when the output is requested at 375px, so that capture is not treated as authoritative true-375px CSS overflow evidence. The 1440px capture was visually clean; no browser interaction runner was available for live copy/download or keyboard-flow E2E evidence.
- Screenshots were transient QA evidence only and are not checked in. No live AI, authenticated session, PostgreSQL, Redis, or provider integration was claimed.

## Phase 09B usage surfaces

### Design Read and decision procedure

- Reading this as: an authenticated-leaning developer usage product UI for developers and learners, with precise audit-friendly console language. The product register is Industrial / utilitarian.
- Decision seed: `RepoMentor|Phase 09B|history|dashboard|usage|quota|review ledger` computes to `6605`. The seeded menu row was Soft / pastel; this phase stepped to the adjacent Industrial row because it extends the existing review console and its accepted visual system.
- Aesthetic thesis: cool concrete field, paper-white panels, ink typography, ember-orange signals, Barlow Condensed display type, Source Sans 3 body type, flush-left ruled sections, and one LineIcon family. Quota rails are the memorable element: they read like a daily operator ledger instead of a decorative chart.
- Component patterns are metric rails, token direction ledger, quota rails, status ledger, a source-free responsive history table/list, and named deferred metrics. Existing shell/navigation patterns remain the frame.

### Skill source boundary

The AgentKit frontend design and development skill contracts, plus `technical-accessibility.md` and `workflow-quick.md`, were read from the shared coordinator-local source at `D:\RepoMentor\engineer\skills\`. That source is not checked out in this worker worktree and was used as instruction only; `D:\RepoMentor\engineer` was not edited. The current repository has no TanStack Query, MUI, or `SuspenseLoader` dependency, so the usage area follows the existing manual hook convention with stable loading shells, typed request versions, cancellation guards, and no package manifest changes.

### Product and data boundary

- `/dashboard` shows total reviews, completed and deep counts, additive input/output/total tokens, recent activity, quota rails, status counts, and language distribution. Values are deterministic fixture values and are visibly labeled as demo transport; they do not imply an authenticated session, persistence, or live metrics.
- `/history` shows source-free review rows with only accepted history fields. The server seam sends `page` and `limit`. Status, mode, and language filters are client-side demo-only controls applied only when the fixture boundary is active. Search, date filtering, and sorting are not presented because they are absent from the accepted server contract.
- `/usage` shows token direction and operation counts only where the accepted summary response is truthful. Cost, spend, model identity, provider attribution, and reasoning measurements are explicitly deferred instead of estimated.
- `features/usage/api/usageApi.ts` performs credentialed GET requests to the three accepted endpoints and validates the envelope, known keys, integer bounds, date-times, additive totals, quota consistency, and history pagination at runtime. Browser code has no provider, model, or API key controls.

### State, interaction, and accessibility decisions

- Stable page shells keep headings and supporting copy visible during loading, then use skeleton rails with `role=status` and `aria-busy`. Error panels use `role=alert` with generic copy and a retry action. Empty history and empty language/status branches are explicit and do not invent counts.
- Filter controls expose selected values and disabled styling. Pagination exposes previous/next disabled states and a live page summary. Inputs remain at least 16px and interactive targets remain at least 44px.
- The usage area keeps the existing LineIcon family, semantic landmarks, visible `:focus-visible` rings, keyboard-reachable controls, text labels alongside color signals, and reduced-motion overrides. Responsive rules switch the history table to a labeled mobile list at 50rem and stack the rails at 30rem. The 375px check had no horizontal overflow.
- Visible copy avoids emoji, em dash, generic AI marketing language, and live-data claims. History rows render review identifiers and usage metadata only, never source code or source content.

### Verification evidence

- `node --test ./apps/web/test/shell.test.mjs`: 32 tests passed, including route and shell links, strict API/fallback validation, optional shared envelope metadata, fixture reconciliation, filter and pagination semantics, source-free rendering, safe quota progress semantics, state contracts, responsive/a11y rules, and no-secret/no-emoji/no-em-dash checks.
- Local ESLint, TypeScript no-emit, Prettier check, and the Next production build passed. The build emitted `/dashboard`, `/history`, and `/usage` alongside the preserved routes.
- A local production build was exercised in the in-app browser at 375px and 1440px. At 375px, document width matched the 360px content viewport, the history table switched to the mobile list, demo filtering reduced the fixture to one failed row, pagination reached page 2, and no horizontal overflow was detected. Desktop checks covered visible primary navigation, the multi-column metric/quota composition, and no horizontal overflow. Screenshots were transient QA evidence only.
- A staged credential-shaped scan was run before each focused commit and remained clean. No secrets, provider credentials, or model controls were added.

### Remediation evidence

- The usage client accepts the shared contract's optional `meta` object only with bounded known keys; empty metadata is valid and unknown or invalid metadata is rejected.
- Quota progress semantics keep displayed over-limit usage truthful while clamping assistive `aria-valuenow` to the declared range and explaining actual overage in `aria-valuetext`.
- The remediation commit `ffcb819` was independently checked with 32 web tests, lint, typecheck, Prettier, Next build, diff-check, staged credential scan, and 375px/1440px browser QA.

### Visual-QA limitations

The browser checks use the deterministic fixture and a local production server. They cannot validate authenticated session behavior, live API data, network-loaded font behavior under offline conditions, or future server-side search/date/sort behavior. The fixture intentionally delays transport responses to exercise loading, but it cannot reproduce real backend failures or quota changes. Those integrations remain the next slice.

## Visual-QA limitations

The implementation was checked with a production build, static HTML inspection, a 375px viewport check for overflow, and a desktop composition check. The deterministic demo does not emit the backend's processing conflict, so the `Check for result` interaction is covered by the bounded polling runtime test rather than a fabricated browser state. This environment does not provide a checked-in screenshot baseline or live backend data, so visual QA cannot validate authenticated routes, repository-specific code, real review findings, network-loaded font behavior under offline conditions, or future editor interactions. The preview is intentionally an illustrative static surface and is labeled accordingly.
