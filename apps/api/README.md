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
