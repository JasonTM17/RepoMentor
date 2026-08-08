# RepoMentor API

The API is a strict TypeScript NestJS application. Phase 02 establishes the
bootstrap and module boundaries needed by later application work.

## Endpoints

The application routes are reserved under `/api/v1`. The health routes are
intentionally excluded from that prefix:

- `GET /health/live` reports that the API process is alive.
- `GET /health/ready` reports that the application is ready for work.
- `GET /health/metrics` reports aggregate application request counters only.
- `GET /api/docs` serves the Swagger UI.

Successful responses use the shared envelope shape:

```json
{
  "data": {
    "status": "ok"
  }
}
```

Readiness is application-only in Phase 02 and returns `scope: "application"`.
It does not probe PostgreSQL, Redis, or OpenAI; those dependency checks are
intentionally reserved for later phases. Health payloads are sourced from
`@repomentor/contracts` and do not expose service metadata or credentials.
Metrics are process-local and intentionally omit route labels, request data,
provider details, dependency URLs, and credentials. They are an operational
signal, not a claim that PostgreSQL, Redis, or Luna are reachable.

## Authenticated review processing transport

Review routes require the `Authorization: Bearer <access-token>` header and
scope every read/write through the authenticated user ID. Successful responses
remain inside the shared `{ "data": ... }` envelope.

`POST /api/v1/reviews/:id/process` runs exactly one bounded synchronous
processing attempt through the server-owned Luna boundary. The request body
must be empty: provider, model, and prompt overrides are rejected. A `200`
response is one of these stable source-free payloads:

```json
{
  "data": {
    "id": "c123456789012345678901234",
    "outcome": "COMPLETED",
    "resultAvailable": true,
    "status": "COMPLETED"
  }
}
```

An already completed review returns `outcome: "SKIPPED"` with
`reason: "ALREADY_COMPLETED"`; an already processing review returns
`reason: "ALREADY_PROCESSING"`, `status: "PROCESSING"`, and
`resultAvailable: false`. Retry-required, failed, and cancelled states map to
the safe conflict/dependency problem categories.

`GET /api/v1/reviews/:id/result` returns only a completed, owner-scoped,
validated result and safe execution metadata. It never includes the stored
source or raw provider payload:

```json
{
  "data": {
    "id": "c123456789012345678901234",
    "status": "COMPLETED",
    "result": {
      "schemaVersion": "v1",
      "summary": "No actionable findings were detected.",
      "findings": []
    },
    "execution": {
      "provider": "luna",
      "model": "gpt-5.6-luna",
      "reasoningEffort": "medium",
      "attempts": 1,
      "durationMs": 42,
      "completedAt": "2026-08-06T01:00:00.000Z",
      "usage": null
    }
  }
}
```

Missing ownership maps to `404 NOT_FOUND`; non-completed reviews map to
`409 CONFLICT`; provider failures map to the generic dependency-unavailable
category. Error envelopes never include provider messages, source, secrets,
raw model payloads, or stack traces. This transport is covered by
deterministic in-memory and fake-Luna tests; it does not claim live AI,
PostgreSQL, Redis, queue, or streaming integration.

## Transport security

The bootstrap uses a validated `CORS_ORIGINS` comma-separated allowlist of
absolute `http`/`https` origins. Origins are normalized before comparison;
wildcards, `null`, paths, and credentials are rejected. Development and test
runs use bounded localhost defaults, while production fails closed unless an
explicit allowlist is supplied. Credentialed responses echo only a configured
origin, expose `X-Request-Id`, and allow preflight methods and headers from the
explicit set. Requests carrying an unlisted `Origin` receive the normal safe
forbidden error envelope and the origin is never reflected.

The API applies equivalent narrowly scoped response hardening directly in the
bootstrap (this project does not claim to use Helmet): `nosniff`, frame and
referrer restrictions, a Swagger-compatible CSP, a restrictive
`Permissions-Policy`, and Express fingerprinting removal. HSTS is emitted only
when the validated runtime environment is production. JSON and URL-encoded
request bodies are each bounded at 128 KiB; oversized bodies receive a `413`
safe error envelope with the request ID preserved.

Refresh cookies remain `HttpOnly`, use the configured `SameSite` policy, and
are forced `Secure` in production; `SameSite=None` is rejected unless Secure
is enabled. This slice does not add a synchronizer or double-submit CSRF
token. The allowlist and `Origin` rejection provide a browser-origin boundary,
but they are not a substitute for a CSRF token when a deployment must use
cross-site cookie authentication. Keep production deployments same-site with
`SameSite=Lax` or `Strict` where possible, and add an explicit CSRF token
before enabling a cross-site `SameSite=None` deployment.

## Development

From the repository root, use the workspace package scripts:

```bash
pnpm --filter @repomentor/api dev
pnpm --filter @repomentor/api typecheck
pnpm --filter @repomentor/api lint
pnpm --filter @repomentor/api build
```

Global bootstrap seams already include strict validation (`whitelist`,
`forbidNonWhitelisted`, and transformation) and Swagger document generation.
Authentication, database access, Redis access, and AI providers are not part
of this scaffold.
