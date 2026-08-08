# Deployment and operations

RepoMentor has local Compose and GitHub workflow contracts plus a verified
container artifact release for `v0.1.4`. Runtime commit `c3d1fe81928062929009e58d47c911ee8d5625ec`
is tagged `v0.1.4`; the container-release workflow published the API and web
images to GHCR/GitHub Packages and Docker Hub. It is not a production
deployment.

## Local Compose

[`docker-compose.yml`](../docker-compose.yml) defines five local services:

- `migrate`: a one-shot Prisma migration runner with no published port;
- `api`: the NestJS API image, bound to a chosen localhost host port;
- `web`: the Next.js image, bound to a chosen localhost host port;
- `postgres`: PostgreSQL 16.4 Alpine with a local named volume;
- `redis`: Redis 7.4.1 Alpine with append-only persistence and a password.

The migration service waits for healthy PostgreSQL and applies the checked-in
migrations. The API starts only after migration succeeds and PostgreSQL and
Redis are healthy; the web depends on the API process-liveness check. The
network is internal and service ports are bound to `127.0.0.1`. The API and web
health checks prove HTTP process/shell liveness only; API `/health/ready`
remains application-only.

For a local setup, copy `.env.example` to an untracked `.env`, choose unused
localhost ports, URL-encode credentials in `DATABASE_URL`/`REDIS_URL`, set the
required JWT/cookie/quota values, and set `NEXT_PUBLIC_API_ORIGIN` to the host
published API URL. The API uses Compose service names (`postgres`, `redis`) in
container connection strings; the browser uses the host-published API origin.

Validate configuration before attempting a startup:

```text
docker compose config --quiet
docker compose up --build
```

The first command is configuration-only. `docker compose up --build` builds the
dedicated migration target, waits for PostgreSQL health, applies migrations,
and starts the API only after the migration container exits successfully. A
migration failure therefore prevents the API and web from starting. To run the
one-shot migration service explicitly, use `docker compose run --rm migrate`.
The API runtime image is production-pruned and non-root; it is not the
migration runner and intentionally does not contain the Prisma CLI, schema, or
checked-in migrations. A live startup, dependency check, and HTTP smoke still
need separate runtime evidence and are not implied by static checks.

## CI workflows

- [`application-gates.yml`](../.github/workflows/application-gates.yml) runs on
  pull requests and pushes to `main` with `contents: read`. It installs frozen
  dependencies, validates/generates Prisma, builds/tests contracts, runs API and
  web gates, formats/lints/typechecks/builds/packages, and fails on high audit
  findings.
- [`container-validation.yml`](../.github/workflows/container-validation.yml)
  validates workflow/Dockerfile/Compose contracts and builds the API runtime,
  API migration target, and web images with `push: false`; it has no registry
  credentials. Its migration-target build is credential-free and does not
  connect to PostgreSQL.
- [`container-release.yml`](../.github/workflows/container-release.yml) is
  triggered by `v*.*.*` tags and then validates a strict semantic version. It
  requires configured Docker Hub
  credentials and owner-approved variables, stages and scans images in GHCR and
  Docker Hub, compares digests, promotes semantic/full-SHA tags, emits SBOM and
  provenance evidence, and publishes only after its fail-closed gates pass.

The release workflow has now run successfully for `v0.1.4`. See
[docs/release.md](release.md) for exact registry refs, manifest digests,
workflow evidence, SBOM/provenance attestations, and the GitHub Release.

## Database and secrets

Apply schema changes as forward-only, append-only Prisma migrations according to
the [migration ownership ADR](architecture/database-migration-ownership.md).
`pnpm db:validate` and `pnpm db:generate` do not connect to PostgreSQL. For the
local Compose stack, the `migrate` service is the migration runner: after
PostgreSQL is healthy it applies the checked-in migrations, and migration
success is a prerequisite for starting the API. Its only runtime input is
`DATABASE_URL`.

To apply migrations from the workspace instead of Compose, after the database
is healthy run:

```bash
pnpm db:migrate
```

For a local or CI non-production database, the idempotent development seed is:

```bash
pnpm db:seed
```

The seed requires explicit `SEED_USER_EMAIL`, `SEED_USER_PASSWORD`, and
`SEED_USER_DISPLAY_NAME` values, validates the auth bounds, hashes the password
with Argon2id, and upserts one `USER`/`ACTIVE` user by email. It refuses
`NODE_ENV=production`, missing or invalid values, and never prints passwords,
tokens, or connection URLs. A real deployment must review and apply migrations
with its backup/rollback policy; do not run the development seed against it.

Provide `LUNA_API_KEY`, database credentials, Redis password, JWT secrets, and
quota fingerprint secrets through an approved secret mechanism. Never expose
server-only Luna credentials to the web image or commit them. The optional RAG
configuration remains disabled and does not authorize a second provider.

## Current blockers

The local Docker daemon was unavailable during the recorded checkpoint, so no
local Compose startup, live PostgreSQL/Redis check, or HTTP smoke is claimed.
The tagged CI run provides separate multi-architecture image publication,
digest, scan, SBOM, and provenance evidence. The npm package/license decision
remains open and is separate from the container release.
