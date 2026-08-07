# Phase 09 — History, dashboard, usage, and quotas

## Dependencies and ownership

- Depends on Phase 08.
- API usage worker owns quota/rate-limit/usage summary endpoints and tests.
- Web usage worker owns dashboard/history/usage/settings views and tests.

## Commit slices

- `feat(history): add paginated review history`
- `feat(history): add review search and filtering`
- `feat(usage): enforce configured daily review quotas`
- `feat(usage): add Redis-backed rate limiting`
- `feat(dashboard): add review and usage overview`
- `test(usage): add quota and rate limit tests`

## Acceptance and validation

Guest/authenticated quotas are configuration-driven; Redis handles short-lived
limits/locks while PostgreSQL remains durable usage truth; counters do not leak
between users; dashboard shows totals, recent reviews, tokens, quota, language
distribution and deep usage.

## Accepted checkpoint: Phase 09A API usage read model

Phase 09A is accepted on local `main` at `4916152` after the exact Luna worker
chain `b93e3d6 -> 488a72a -> 642fe6d`, based on `80c0c8c`. The API now exposes
authenticated owner-scoped `GET /api/v1/usage/summary`, paginated
`GET /api/v1/usage/history`, and `GET /api/v1/usage/quota` routes. Summary and
history exclude soft-deleted reviews and never select source; durable usage
totals are restricted to owned completed persisted results. Quota reads use
configuration-driven authenticated limits (`QUICK=20`, `STANDARD=10`,
`DEEP=3` by default), strict bounded environment overrides, and an inclusive
start/exclusive next-midnight UTC window. Quota intentionally counts all
owner-created review records in that UTC window, including soft-deleted rows,
so deletion cannot bypass daily limits.

Post-merge evidence is API `107/107`, web `25/25`, contracts `5/5` (`137/137`
root tests), lint, typecheck, build, Prettier, Prisma validate/generate,
diff-check, and a bounded credential-shaped scan. Luna manager and
Kongming/Terra counsel accepted the exact worker head with no P0/P1 blocker.
This is a bounded read-model checkpoint, not completion of Phase 09: Redis
atomic enforcement, guest quotas, history search/filter, dashboard UI, live
PostgreSQL/Redis evidence, and strict snapshot/cursor-pagination hardening
remain follow-up slices. The worker's pnpm lifecycle guard limitation was
recorded; equivalent repository-local compiler/linter/formatter checks passed
and the final worker worktree was clean.

## Accepted checkpoint: Phase 09B web usage surfaces

Phase 09B is accepted on local `main` at `ffcb819` after the exact Luna worker
chain `53b805f -> 27c7fb7 -> c88c045 -> 1c362e8 -> a7d861f -> cb1cf3c ->
93e077a -> 9e6a346 -> 6695ed2`, based on `dceb935`. The web shell now links
to `/dashboard`, `/history`, and `/usage`. The dashboard shows deterministic
review totals, completed/deep counts, token direction, recent source-free
activity, language distribution, status counts, and UTC quota rails. History
uses the accepted page/limit seam, a responsive source-free table/list, and
status/mode/language filters only inside the explicitly labeled deterministic
demo fixture. Search, date filtering, and sorting are not presented because
they are not in the accepted server contract. Usage displays only truthful
token/operation fields and names cost, model, provider, and reasoning metrics
as deferred rather than estimating them.

The client API boundary validates strict summary/history/quota data, accepts
only the shared optional envelope metadata keys, and rejects unknown or
invalid metadata. Quota progress semantics preserve displayed overage truth
while keeping assistive progress values within their declared range. Post-
merge evidence is web `32/32`, API `107/107`, contracts `5/5` (`144/144` root
tests), lint, typecheck, build, Prettier, Prisma validate/generate,
diff-check, staged credential-shaped scans, and browser QA at 375px and
1440px with no horizontal overflow. Luna manager and Kongming/Terra counsel
accepted the exact head with no P0/P1 blocker.

This is a bounded UI checkpoint, not live Phase 09 completion. The default
routes remain deterministic-demo only; authenticated API wiring is not active
because the browser seam currently sends cookies while the API guard requires
a Bearer access token. Live auth/session/API behavior, PostgreSQL/Redis,
server-side search/date/sort, backend failure simulation, and future cost/
model/provider/reasoning fields remain follow-up slices. History validator
cross-field consistency and offline-font/live-service evidence are P2
hardening items.

## Accepted checkpoint: Phase 09C server history filters

Phase 09C is accepted on local `main` at `8a4acc3` after cherry-picking the
exact Luna worker chain `97db82b -> e462686 -> f37ed79 -> 0a6aaef`, based on
`1b0f82d`. The authenticated usage-history route now supports optional
language, mode, status, bounded review-ID-only search, stable `createdAt` plus
`id` ordering, and strict inclusive-`from`/exclusive-`to` UTC date-time
filters. Count and page queries reuse the same owner and `deletedAt: null`
predicates; the Prisma select and response remain source-free. Swagger and
global DTO validation document and reject unknown, ambiguous, out-of-range,
or invalid query values. Prisma `LIKE`/`ILIKE` wildcard semantics are handled
by escaping `_` at the repository boundary; persisted title search remains a
P2 schema/migration decision because the current Review model has no title.

Post-merge evidence is API `112/112` across 23 suites, API lint, typecheck,
build, Prettier, Prisma validate/generate with a non-secret placeholder
`DATABASE_URL`, diff-check, and a credential-shaped scan with no matches. The
worker additionally passed focused usage `21/21`; its D: worktree is clean.
Luna manager and Kongming/Terra counsel accepted exact worker head
`0a6aaef06ff66274da406f8c9c6024fe1327fc67` with no P0/P1 blocker. P2 limits
are explicit: no live PostgreSQL execution proof yet, and bounded offset
search/pagination should be profiled before high-volume production use.
This is a server-filter checkpoint, not completion of Phase 09: Redis atomic
enforcement, guest quotas, live auth/API wiring, live PostgreSQL/Redis, and
cursor/snapshot consistency remain later work.

## Accepted checkpoint: Phase 09D1 Redis quota and lock primitives

Phase 09D1 is accepted on local `main` at `0eda9cf` after cherry-picking the
exact Luna worker chain `cb4ce7f -> d50da34 -> 42b6464 -> 62d921f`, based on
`41a2d63`. The API now has a reusable node-redis 6.2.0 adapter with validated
Redis URL handling, lazy construction, `isReady` gating, disabled offline
queue, no automatic reconnect, bounded unref'd connect/command deadlines, and
redacted typed unavailable errors. Quota reservation is one atomic Lua/EVAL
operation with authenticated defaults (`QUICK=20`, `STANDARD=10`, `DEEP=3`),
guest QUICK default `3`, UTC-day expiry, bounded namespaced keys, and safe
result parsing. Review locks use `SET NX PX` plus compare-and-delete Lua
release with opaque bounded tokens and operation-specific error context.

Post-merge evidence is focused Redis `17/17`, API `129/129` across 28 suites,
API build, typecheck, lint, Prettier, Prisma validate/generate with a
non-secret placeholder `DATABASE_URL`, diff-check, and commit-range
credential-shaped scan with no matches. The Luna manager and Kongming/Terra
counsel accepted exact worker head
`62d921fb81836cb462cb796e4328a5a3f8ace21f` with no P0/P1 blocker after the
fail-fast and operation-context remediation.

This is a primitives-only checkpoint, not production readiness or Phase 09
completion. No live Redis/PostgreSQL execution or HTTP/guest endpoint wiring
was claimed. A timed-out Redis command remains indeterminate and must not be
blindly retried; identities must be derived server-side before integration;
lock lease duration must align with processing/fencing; and a configured
`USAGE_REDIS_QUOTA_TTL_MAX_SECONDS` below the remaining UTC day safely rejects
reservation rather than shortening a daily quota window. Endpoint enforcement,
durable usage reconciliation, live Redis tests, and cancellation/provider
failure compensation remain the next integration slice.

## Accepted checkpoint: Phase 09D2 quota admission foundation

Phase 09D2 is accepted on exact `main` at `829ad06`, based on `8412b9c`, after
the coordinator cherry-picked worker commits `fe04d207` (quota admission
ledger) and `02978e02` (Redis absolute-expiry repair) as `28e0c7b` and
`53146aa`, then applied lint fix `f92491c` and formatter `829ad06`. The final
exact `main` before this docs commit is `829ad06`. The source scope is an
additive Prisma `QuotaAdmission` schema/migration, hashed idempotency,
owner/status repository behavior, and Redis admission marker/compensation.
The worker used `gpt-5.6-luna` / `max`; Luna manager and Kongming/Terra counsel
accepted the exact head with no P0/P1 blocker.

Evidence is Prisma generate and validate with a non-secret placeholder
`DATABASE_URL`, API `tsc --noEmit` and build, ESLint, root Prettier, compiled
API suite `141/141` across `33` suites, focused Redis `6/6`, diff-check, and a
credential-shaped scan with no matches. An isolated worker encountered EPERM
while generating output; coordinator main gates succeeded after direct
binaries.

This is a foundation checkpoint, not production readiness or Phase 09
completion. No live Redis/Postgres/HTTP/guest/process-lock integration was run
or claimed. Live EVAL execution and migration/DB-isolation verification remain
P2. Caller-supplied custom `admissionId`/`reviewId` conflict policy and replay
`retryAfter` remain follow-ups. D2A integration is blocked on a design
decision: no commit was made, and a safe durable ledger is required before
integration wiring.
