# Phase 08 — Code review UI

## Dependencies and ownership

- Depends on Phase 07.
- Web workers own disjoint feature folders: editor/form, result/issue views,
  diff/tests/questions, and route-level integration. Shared layout/config is
  coordinator-sequenced.

## Commit slices

- `feat(web-review): add Monaco code review editor`
- `feat(web-review): add review configuration form`
- `feat(web-review): connect review creation API`
- `feat(web-review): display streaming review progress`
- `feat(web-review): render structured review results`
- `feat(web-review): add issue filtering and line highlighting`
- `feat(web-review): add original and improved code diff`
- `feat(web-review): display generated tests and learning questions`

## Acceptance and validation

Responsive, accessible new-review and detail pages support loading/error/empty
states, validation, keyboard focus, cancel/retry, severity/category filters,
line highlighting, copy/download, diff view, assumptions, limitations, usage,
and processing duration without exposing raw backend errors.

## Accepted checkpoint: Phase 08A review workspace

Phase 08A is accepted on local `main` at `0c46164` after the exact Luna worker
chain `533cf73 -> c96988f -> 5eca1bf -> 9ea5afa -> 9aac007`, integrated as
`bd12761`, `6740d70`, `ec51172`, `011a516`, and `0c46164`. The new
`/reviews/new` route provides an industrial/utilitarian review workspace with
the existing LineIcon family, token-first styling, source/title/context fields,
the complete ten-language starter set, learner level and review mode controls,
local character/token estimates, validation, loading/processing/success/empty/
error states, bounded result polling, retry/check affordances, summary and
finding views, severity/category filters, line highlighting, copy action, and
safe execution metadata. The browser contract is deliberately explicit:
`reviewApi` validates strict `{ data, meta? }` envelopes and the accepted
`POST /api/v1/reviews/:id/process` plus `GET /api/v1/reviews/:id/result` shape;
the route defaults to a deterministic fixture and does not claim live AI,
usage, quota, auth, or persisted review data.

Post-merge evidence: web `25/25`, API `91/91`, contracts `5/5` (`121/121`
root tests), web/API build, lint, typecheck, Prettier, diff-check, and
credential-shaped secret scan pass. Production-build browser QA measured 375px
and 1440px layouts with no horizontal overflow; no screenshot artifact is
claimed. Luna manager and Kongming/Terra counsel accepted exact head `9aac007`
with no P0/P1 blocker.

Known P2 boundaries remain intentional: the route still uses the labeled demo
transport until authenticated review creation is wired; Monaco, streaming,
history/detail, download/diff, generated tests/questions, and live
AI/PostgreSQL/Redis/queue evidence remain later slices. Client result parsing
does not yet duplicate every server-side text/count bound, and cancellation
fences stale UI work without aborting an already in-flight fetch. Do not call
this checkpoint production-ready.
