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
