# Phase 03 — Local infrastructure and database

## Dependencies and ownership

- Depends on Phase 02.
- One infra/database worker owns Compose, Docker support, Prisma schema,
  migrations, seed, and config validation.
- Migration files are strictly sequential and never parallel-edited.

## Commit slices

- `chore(infra): add PostgreSQL and Redis services`
- `feat(config): add validated environment configuration`
- `feat(database): initialize Prisma schema and migrations`
- `feat(database): add deterministic development seed`

## Acceptance and validation

Compose config validates; services have health checks; Prisma schema validates;
UUID/CUID, indexes, unique email, soft-delete decisions, and transaction seams
are documented; no connection string appears in API responses or logs.
