# Phase 03 — Local infrastructure and database checkpoint

Status: checkpoint accepted at integrated HEAD `f41d92f`; full domain
migration and seed work is intentionally owned by Phase 04.

## Dependencies and ownership

- Depends on Phase 02.
- One sequenced Luna infra/database owner owns Compose, Docker support, Prisma
  tooling, and server configuration.
- Migration files are strictly sequential and never parallel-edited.
- The first real User/Session migration and deterministic seed are owned by
  Phase 04 auth. Phase 03 does not create a placeholder migration for an
  unknown domain model.

## Commit slices

- `chore(infra): add PostgreSQL and Redis services`
- `feat(config): add validated environment configuration`
- `feat(database): initialize Prisma tooling`
- `chore(deps): lock Prisma tooling`

## Acceptance and validation

Compose config validates and defines PostgreSQL/Redis health checks; validated
configuration rejects unsafe or incomplete runtime variables without echoing
raw values; Prisma format, validate, and generate pass against the empty
tooling schema; migration ownership is documented; no connection string
appears in API responses or logs.

## Checkpoint evidence

- Integrated HEAD: `f41d92f` (`main`).
- Compose: PostgreSQL `16.4-alpine` and Redis `7.4.1-alpine`, localhost-bound
  ports, named volumes, internal network, and health checks.
- Configuration: bounded `APP_PORT`/`PORT` parsing plus non-test
  `DATABASE_URL`/`REDIS_URL` requirements; six focused configuration tests.
- Prisma: pinned `prisma` and `@prisma/client` `6.19.0`; schema format,
  validation, and client generation passed; no migration was invented before
  the User/Session domain exists.
- Exact-head gates: frozen install, lint, typecheck, 21 tests, build, format
  check, Prisma checks, Compose config, diff check, and bounded secret scan
  passed.
- Runtime limitation: Docker Compose syntax was validated, but the local
  Docker daemon was offline, so PostgreSQL/Redis health was not claimed.

## Deferred to Phase 04

- User and Session models, immutable first migration, deterministic auth seed,
  and live database/Redis integration checks.
- UUID/CUID, unique email, soft-delete, indexes, and transaction seams are
  decided with the auth schema and recorded before that migration is committed.
