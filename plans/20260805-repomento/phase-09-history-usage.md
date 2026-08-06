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
