# API design

The API is a NestJS application with the global prefix `/api/v1` for application
routes. Health routes are intentionally outside that prefix. Swagger is mounted
at `/api/docs` in non-production environments only.

## Transport conventions

- JSON success responses are wrapped by the global response-envelope
  interceptor. Clients must validate the `data` payload and optional bounded
  metadata instead of trusting arbitrary JSON.
- Errors use a safe `{ error: { code, message, requestId } }` shape. Request IDs
  are generated or propagated by the request-ID middleware and are safe to
  return to a caller.
- Authenticated routes require `Authorization: Bearer <access-token>`.
  Refresh is a server-owned cookie flow; the browser client does not persist
  access or refresh tokens in Web Storage.
- Public review creation never chooses a provider, model, prompt, tool, or
  execution setting. Processing accepts an empty body and selects the server
  Luna boundary.
- Cross-origin requests must match the normalized, explicit CORS allowlist.
  Preflight methods and headers are bounded; an invalid origin receives a safe
  `403` without origin reflection.

## Route map

### Health

| Method | Path              | Contract                                                                               |
| ------ | ----------------- | -------------------------------------------------------------------------------------- |
| `GET`  | `/health/live`    | Process liveness: `{ status: "ok" }`.                                                  |
| `GET`  | `/health/ready`   | Application-only readiness; it does not probe PostgreSQL, Redis, or AI.                |
| `GET`  | `/health/metrics` | Aggregate process-local request counters without source, provider, or credential data. |

### Authentication

| Method  | Path                      | Contract                                                                                       |
| ------- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| `POST`  | `/api/v1/auth/register`   | Bounded registration; returns an indistinguishable accepted response.                          |
| `POST`  | `/api/v1/auth/login`      | Creates a session and returns a short-lived Bearer access token.                               |
| `POST`  | `/api/v1/auth/refresh`    | Rotates the API-owned refresh cookie and returns a new access token.                           |
| `POST`  | `/api/v1/auth/logout`     | Revokes the presented session when valid and clears the cookie.                                |
| `POST`  | `/api/v1/auth/logout-all` | Revokes all active sessions for the authenticated user.                                        |
| `PATCH` | `/api/v1/auth/password`   | Verifies the old password, changes the Argon2id hash, revokes sessions, and clears the cookie. |
| `GET`   | `/api/v1/auth/me`         | Returns the authenticated public user.                                                         |

### Reviews and usage

| Method   | Path                          | Contract                                                                                                  |
| -------- | ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/v1/reviews`             | Authenticated, bounded request with required `Idempotency-Key`; admits or safely replays an owned review. |
| `GET`    | `/api/v1/reviews`             | Owner-scoped paginated list with bounded page, limit, and status filters.                                 |
| `GET`    | `/api/v1/reviews/:id`         | Owner-scoped review detail.                                                                               |
| `GET`    | `/api/v1/reviews/:id/events`  | Owner-scoped status-only SSE with bounded replay cursor.                                                  |
| `POST`   | `/api/v1/reviews/:id/process` | Runs one bounded synchronous review through pinned Luna; request body must be empty.                      |
| `GET`    | `/api/v1/reviews/:id/result`  | Returns one validated result for an owned completed review.                                               |
| `POST`   | `/api/v1/reviews/:id/cancel`  | Cancels an owned review run through the run coordinator.                                                  |
| `POST`   | `/api/v1/reviews/:id/retry`   | Waits for the caller's run to be idle and retries an owned review.                                        |
| `DELETE` | `/api/v1/reviews/:id`         | Soft-deletes an owned review.                                                                             |
| `GET`    | `/api/v1/usage/summary`       | Owner-scoped usage summary.                                                                               |
| `GET`    | `/api/v1/usage/history`       | Owner-scoped source-free history with bounded filters and pagination.                                     |
| `GET`    | `/api/v1/usage/quota`         | Authenticated UTC-day quota read model.                                                                   |

The guest path is separate at `POST /api/v1/guest/reviews` and is transient; it
does not create an authenticated history record. The route implementations are
in [`apps/api/src/modules`](../apps/api/src/modules), especially
[`review.controller.ts`](../apps/api/src/modules/review/review.controller.ts),
[`auth.controller.ts`](../apps/api/src/modules/auth/auth.controller.ts), and
[`usage.controller.ts`](../apps/api/src/modules/usage/usage.controller.ts).

## Validation and ownership

Global `ValidationPipe` rejects non-whitelisted properties. DTOs and AI policy
bound source, language, mode, learner level, title, context, identifiers,
pagination, and idempotency input. The access guard resolves a live user and
session before attaching `userId` and `sessionId` to the request. Controllers
pass that identity into repository/service methods; repositories repeat the
owner predicate rather than trusting a client-supplied owner field.

## Streaming and errors

Review lifecycle SSE sends status-only snapshots/events, supports a bounded
`Last-Event-ID`, and closes at a terminal state. It does not stream source or
provider bodies. Processing maps Luna timeout, rate-limit, unavailable,
authentication, cancellation, and malformed-result cases to safe application
responses without returning provider details.

The API contract is tested through the contracts package, API unit tests, and
in-memory/controller tests. Those tests do not prove a live HTTP provider,
PostgreSQL transaction, Redis stream, or multi-instance SSE deployment.
