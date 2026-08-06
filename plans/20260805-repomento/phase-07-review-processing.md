# Phase 07 — Review processing and streaming

## Dependencies and ownership

- Depends on Phase 06.
- The processing worker owns the review-processing slices. Shared Prisma
  schema/migration and root configuration remain sequenced coordinator-owned
  integration points.

## Accepted slice 07A — orchestration boundary

Status: accepted on `main` at `6b2dfe4`.

The Luna worker branch `feature/review-processing` was based on `f8eb156` and
was accepted at the exact chain `b907af0 -> ddaacb4`. The coordinator
cherry-picked it as `aab1d48` and `6b2dfe4`. It provides a pure
`ReviewProcessingService` boundary with an owner-scoped repository port and
explicit claim/finalization outcomes:

- PENDING can be claimed once into PROCESSING;
- valid Luna results complete the review through a typed result boundary;
- provider and structured-output failures map to safe FAILED outcomes;
- cancellation maps to CANCELLED and remains race-aware;
- concurrent terminal claims and retry-required terminal states are explicit
  SKIPPED outcomes;
- repository finalization errors are not misreported as provider failures.

The worker and exact-head manager review reported 13/13 focused processing
tests, 75/75 API tests, API build/typecheck/lint, Prettier, diff-check, and a
clean branch. Post-cherry-pick root tests pass web 16/16 and contracts 5/5 as
well. Kongming/Terra counsel found no P0/P1 blocker.

This is an orchestration seam, not end-to-end processing yet. Prisma result
persistence, a public route/queue, SSE/reconnect transport, durable retry
state, and live PostgreSQL/Redis/AI evidence remain required in later slices.

## Accepted slice 07B — transactional result persistence

Status: accepted on `main` at `ce6222b`.

The Luna worker `feature/review-persistence` started from `546acf5` and
delivered `3bddb27`; the coordinator cherry-picked it as `ce6222b` after exact
head review. The slice adds:

- a strict, bounded persistence contract for the already validated Luna
  `AiReviewExecution<ReviewResult>`;
- one owner-scoped `ReviewResult` row per completed review and an optional
  `ReviewUsage` row with bounded token arithmetic;
- a Prisma migration with unique result/usage relationships, Luna/model
  constraints, JSON/duration/attempt/token bounds, and cascade foreign keys;
- an owner-scoped `finalizeForUser` repository seam that conditionally matches
  PROCESSING and writes the status, result, and usage in one `$transaction`;
- matching in-memory behavior and tests for success, rollback, failure,
  cancellation, ownership, duplicate finalization, and terminal races;
- a guard preventing the generic status-transition seam from writing
  COMPLETED without a persisted result.

Post-merge evidence is focused persistence/processing `18/18`, API `80/80`,
web `16/16`, contracts `5/5`, root `101/101`, Prisma validate/generate, API
build/typecheck/lint, root formatting, diff-check, and staged secret scan.
The manager and Kongming/Terra counsel accepted the exact head with no P0/P1
blocker.

The migration and repository transaction have not been exercised against a
live or disposable PostgreSQL instance in this environment. Database-level
enforcement that every COMPLETED review has a result and live
isolation/rollback/concurrency checks remain P2 follow-ups. The 07C follow-up
adds a bounded persisted processing generation fence for the synchronous
transport; durable multi-worker leases remain later work.

## Slice 07C — authenticated synchronous processing transport

Status: accepted on `main` at `cede60c`.

The worker branch `feature/review-processing-command` was based on `81b6bbd`
and delivered the exact chain `ad32a51 -> 1ba9735 -> 3cea836 -> 65ebf48`.
The coordinator cherry-picked it as `41b65a9`, `e7caccb`, `54179dd`, and
`cede60c` after Luna manager and Kongming/Terra counsel accepted the remediated
exact head with no P0/P1 blocker.

The slice adds a narrow HTTP seam over the accepted processing and persistence
boundaries:

- `ReviewProcessingService` is injectable through `ReviewModule` while its
  manual constructor remains available for deterministic tests;
- `POST /api/v1/reviews/:id/process` runs one bounded synchronous Luna attempt,
  rejects client processing options, and returns a stable source-free response
  for completion and already-processing/already-completed idempotent skips;
- `GET /api/v1/reviews/:id/result` returns only an owner-scoped validated result
  with fixed Luna execution metadata and bounded usage, never stored source or
  raw provider payloads;
- not-found, conflict, provider failure, cancellation, invalid state, and
  unexpected persistence paths map to existing safe API problem categories;
- stale process-owned runs are fenced by a persisted bounded generation token;
  Luna timeout, unavailable, and rate-limit failures map to 504, 503, and 429
  safe envelopes respectively;
- HTTP response DTOs expose ISO timestamp strings, and the processing/result
  operations document their empty body, envelope, success variants, and safe
  dependency responses in Swagger;
- controller/e2e coverage uses in-memory repositories and a fake Luna provider
  for auth, ownership, idempotency, invalid IDs/states, failure/cancellation,
  result retrieval, and leakage checks.

This remains deterministic transport evidence only. It does not claim live Luna,
PostgreSQL, Redis, queues, retries, cancellation transport, SSE/reconnect,
web UI, or deployment integration.

Exact-head evidence on `65ebf48`: API `91/91`, root `112/112` (web `16/16`,
contracts `5/5`), focused processing/persistence `22/22`, review E2E `13/13`,
API/root build, lint, typecheck, and format, Prisma validate/generate with a
local-only URL, diff-check, and staged secret scan. The remediated route maps
typed timeout/unavailable/rate-limit failures to 504/503/429, preserves a safe
502 fallback for unknown failures, serializes timestamps as ISO strings, and
documents empty-body/envelope schemas in Swagger. No live service or provider
call was made.

The generation fence is deterministic transport hardening: a claim increments
the bounded persisted generation and every process-owned complete/fail/cancel
finalization requires the exact generation. Stale request A cannot finalize,
fail, or cancel retried request B. P2 follow-ups remain an HTTP disconnect to
AbortSignal bridge, outer deadline, per-owner concurrency/quota controls,
full Swagger schemas for generic result/usage objects, and live PostgreSQL
isolation/concurrency evidence before public AI traffic.

## Commit slices

- `feat(review): add AI review processing pipeline` (07A accepted)
- `feat(review): persist review results transactionally` (07B accepted)
- `feat(review): expose synchronous processing and result transport` (07C)
- `feat(review): add review cancellation support`
- `feat(streaming): stream review progress to clients`
- `feat(review): add failed review retry workflow`
- `test(review): cover review status transitions`

## Acceptance and validation

Completed reviews always have validated results; usage and result writes are
transactionally consistent; reconnects do not duplicate reviews; unmount and
cancel are safe; interrupted streams and provider errors map to domain errors;
SSE tests cover all statuses.
