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
    "status": "ok",
    "service": "api",
    "checks": {
      "application": "up"
    }
  }
}
```

Readiness is application-only in Phase 02. It does not probe PostgreSQL or
Redis; those dependency checks are intentionally reserved for Phase 03.

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
