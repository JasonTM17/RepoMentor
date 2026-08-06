# RepoMentor API

The API is a strict TypeScript NestJS application. Phase 02 establishes the
bootstrap and module boundaries needed by later application work.

## Endpoints

The application routes are reserved under `/api/v1`. The health routes are
intentionally excluded from that prefix:

- `GET /health/live` reports that the API process is alive.
- `GET /health/ready` reports that the application is ready for work.
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
