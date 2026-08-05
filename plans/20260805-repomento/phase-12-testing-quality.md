# Phase 12 — Testing and quality expansion

## Dependencies and ownership

- Depends on Phase 11.
- Luna tester owns test additions and reports; implementation workers fix only
  defects proven by failing tests and keep fixes in focused branches.

## Commit slices

- `test(api): expand service unit test coverage`
- `test(api): add end-to-end API tests`
- `test(web): add review workflow component tests`
- `test(e2e): add complete user review journey`
- `fix(web): improve accessibility and keyboard navigation`

## Acceptance and validation

Default tests use deterministic AI; live AI tests require
`RUN_LIVE_AI_TESTS=true`; auth/review/quota/transaction/status/error/race/
cancellation/ownership/prompt-injection cases are covered; Playwright proves
register -> login -> review -> result -> diff -> history -> logout.
