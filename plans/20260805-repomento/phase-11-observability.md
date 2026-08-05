# Phase 11 — Observability and readiness

## Dependencies and ownership

- Depends on Phase 10.
- Observability worker owns structured logging, request correlation, metrics,
  error filters, AI latency/usage metrics, and readiness checks.

## Commit slices

- `feat(observability): add structured application logging`
- `feat(observability): add request correlation IDs`
- `feat(observability): expose application metrics`
- `feat(health): add database and Redis readiness checks`

## Acceptance and validation

Logs include requestId/route/method/status/duration and optional user id but no
secrets; metrics cover HTTP/AI/tokens/review outcomes/streams/dependencies;
live and ready health responses are stable and do not make unnecessary AI
requests or expose credentials.
