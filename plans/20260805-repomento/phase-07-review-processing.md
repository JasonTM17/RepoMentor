# Phase 07 — Review processing and streaming

## Dependencies and ownership

- Depends on Phase 06.
- Processing worker owns orchestration service, transaction boundary, status
  machine, SSE endpoint, cancellation, retry, and idempotency.

## Commit slices

- `feat(review): add AI review processing pipeline`
- `feat(review): persist review results transactionally`
- `feat(review): add review cancellation support`
- `feat(streaming): stream review progress to clients`
- `feat(review): add failed review retry workflow`
- `test(review): cover review status transitions`

## Acceptance and validation

Completed reviews always have validated results; usage and result writes are
transactionally consistent; reconnects do not duplicate reviews; unmount and
cancel are safe; interrupted streams and provider errors map to domain errors;
SSE tests cover all statuses.
