# Deployment and operations

RepoMentor currently has local Compose and GitHub workflow contracts. No image,
package, GitHub release, registry tag, or production deployment is claimed by
the checkpoint at `a8439bfa3fd03405a3ed26f0cbdefe06b6c736bb`.

## Local Compose

[`docker-compose.yml`](../docker-compose.yml) defines four local services:

- `api`: the NestJS API image, bound to a chosen localhost host port;
- `web`: the Next.js image, bound to a chosen localhost host port;
- `postgres`: PostgreSQL 16.4 Alpine with a local named volume;
- `redis`: Redis 7.4.1 Alpine with append-only persistence and a password.

The API depends on healthy PostgreSQL and Redis containers; the web depends on
the API process-liveness check. The network is internal and service ports are
bound to `127.0.0.1`. The API and web health checks prove HTTP process/shell
liveness only; API `/health/ready` remains application-only.

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

The first command is configuration-only. A live startup, dependency check,
HTTP smoke, and migration run must be recorded separately; they are not implied
by the repository's unit tests.

## CI workflows

- [`application-gates.yml`](../.github/workflows/application-gates.yml) runs on
  pull requests and pushes to `main` with `contents: read`. It installs frozen
  dependencies, validates/generates Prisma, builds/tests contracts, runs API and
  web gates, formats/lints/typechecks/builds/packages, and fails on high audit
  findings.
- [`container-validation.yml`](../.github/workflows/container-validation.yml)
  validates workflow/Dockerfile/Compose contracts and builds API/web images
  with `push: false`; it has no registry credentials.
- [`container-release.yml`](../.github/workflows/container-release.yml) is
  triggered by a strict `v*.*.*` tag. It requires configured Docker Hub
  credentials and owner-approved variables, stages and scans images in GHCR and
  Docker Hub, compares digests, promotes semantic/full-SHA tags, emits SBOM and
  provenance evidence, and publishes only after its fail-closed gates pass.

The release workflow is a contract, not proof that it has run. The current
checkpoint has no published image or package and no release tag.

## Database and secrets

Apply schema changes as forward-only, append-only Prisma migrations according to
the [migration ownership ADR](architecture/database-migration-ownership.md).
`pnpm db:validate` and `pnpm db:generate` do not connect to PostgreSQL. A real
deployment must review and apply migrations with its backup/rollback policy.

Provide `LUNA_API_KEY`, database credentials, Redis password, JWT secrets, and
quota fingerprint secrets through an approved secret mechanism. Never expose
server-only Luna credentials to the web image or commit them. The optional RAG
configuration remains disabled and does not authorize a second provider.

## Current blockers

The local Docker daemon was unavailable during the recorded checkpoint, so no
local image build, Compose startup, live PostgreSQL/Redis check, HTTP smoke,
registry push, package publish, or deployment evidence exists. A future release
also needs the owner's explicit package/license decision and configured registry
secrets; those gates must not be silently skipped.
