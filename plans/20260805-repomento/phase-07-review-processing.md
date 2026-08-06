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
enforcement that every COMPLETED review has a result, claim-generation/lease
fencing for multiple workers, and live isolation/rollback/concurrency checks
remain P2 follow-ups before queues, retries, or public result transport.

## Commit slices

- `feat(review): add AI review processing pipeline` (07A accepted)
- `feat(review): persist review results transactionally` (07B accepted)
- `feat(review): add review cancellation support`
- `feat(streaming): stream review progress to clients`
- `feat(review): add failed review retry workflow`
- `test(review): cover review status transitions`

## Acceptance and validation

Completed reviews always have validated results; usage and result writes are
transactionally consistent; reconnects do not duplicate reviews; unmount and
cancel are safe; interrupted streams and provider errors map to domain errors;
SSE tests cover all statuses.
