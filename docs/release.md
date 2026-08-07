# RepoMentor release notes and artifact boundaries

This note describes the current private monorepo and its release boundaries.
It is documentation, not evidence of a deployment, registry publication,
package publication, or production readiness.

## Source/evidence baseline

- Current implementation checkpoint: `4b2dfb7`.
- Latest plan evidence checkpoint: `34a9610`.
- These SHAs are exact-head evidence anchors for the local checks recorded in
  the current checkpoint addendum; they do not establish a tag, release,
  registry artifact, license, deployment, or production certification.

## Current status

- Root package: `repomento@0.1.0`, `private: true`.
- Workspace packages: `@repomentor/api`, `@repomentor/web`,
  `@repomentor/contracts`, `@repomentor/eslint-config`, and
  `@repomentor/typescript-config`; all are `private: true`.
- No repository `LICENSE` file or package `license` field is present, and no
  license decision is invented here.
- No npm/public package artifact, tag, GitHub release, GHCR image, or Docker
  Hub image is claimed as published by this repository.
- No deployment is performed or certified by this worker.
- The external GitHub About metadata was not changed or verified by this task.

## Current implementation boundary

### Authenticated quota admission

`POST /api/v1/reviews` is protected by the API access guard and requires a
bounded `Idempotency-Key`. The server canonicalizes the language with NFC,
trim, and lowercase normalization, preserves source as untrusted data,
resolves an omitted mode to `STANDARD`, and rejects a null or invalid mode
before mutation.

The server normalizes and hashes idempotency material, then computes a
version-1 HMAC-SHA-256 request fingerprint over the canonical source,
language, and mode. It creates an owner-scoped durable `QuotaAdmission`
intent, reserves the authenticated UTC-day quota with one atomic Redis
`EVAL` operation, and finalizes the preallocated owned review through the
Prisma boundary. Durable records retain the hash and explicit fingerprint
version, not raw idempotency material or the fingerprint secret.

An identical owner request replays without a second review or Redis
reservation. A new admission returns `201`, a replay returns `200`, a
conflicting reuse returns `409`, confirmed quota denial returns `429` with a
bounded `Retry-After`, and ambiguous Redis or persistence outcomes fail closed
into safe unavailable or reconciliation states. They are not blindly retried
or compensated.

`QUOTA_ADMISSION_FINGERPRINT_SECRET` is server-only configuration. It must be
32 to 4096 UTF-8 bytes outside test-only injection, is required by Compose,
and remains empty in `.env.example`. HTTP callers cannot provide the secret,
fingerprint, or fingerprint version metadata.

### Redis seam and lock primitive

The integrated code exposes one neutral `REDIS_COMMAND_EXECUTOR` and
`USAGE_REDIS_CONFIG` dependency-injection seam. The production adapter is
lazy, validates Redis URLs, disables the node-redis offline queue, disables
automatic reconnect, uses bounded connect/command deadlines, and preserves
operation-specific redacted unavailable errors. The authenticated admission
path uses the shared seam for its atomic quota-admission reservation and
marker/compensation scripts.

The reusable review lock primitive uses `SET NX PX` with an opaque bounded
token and compare-and-delete Lua release. It is a primitive only: the current
review processing route does not acquire or release this lock, and the lock
TTL is not process-lock or multi-worker evidence.

### Explicit deferred boundaries

- Guest QUICK quota exists as a Redis primitive/configuration boundary with a
  default of `3`, but no guest HTTP route or guest admission integration is
  implemented.
- Processing is a bounded synchronous transport seam. There is no queue, SSE
  or reconnect result stream, and no claim of streaming implementation.
- Deterministic tests use fake Luna, in-memory repositories, and deterministic
  Redis executors. No live PostgreSQL migration/transaction isolation, Redis
  `EVAL`, HTTP provider, or external Luna call was run for this refresh.
- Authenticated web usage pages use a memory-only Bearer transport when a
  session exists; guest pages retain deterministic/demo-labelled fixtures.
  Compose healthchecks cover process/HTTP shell liveness, not dependency-aware
  readiness.
- No deployment, production traffic, registry publication, or production
  readiness follows from local tests, Compose configuration, or image workflow
  definitions.

## Validation evidence

The table below is historical evidence from the earlier documentation
refresh, before the current implementation checkpoint. It used Node
`v24.12.0`, pnpm `11.0.9`, safe non-secret test fixtures, and direct local
binaries where pnpm's nested install-status check was blocked. The current
checkpoint addendum follows the table.

| Check                                                       | Result                                                                                                                                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API compile and deterministic tests                         | Pass: `193/193` tests across `39` suites, `0` failed and `0` cancelled.                                                                                                                                         |
| Shared contracts tests                                      | Pass: `5/5`.                                                                                                                                                                                                    |
| Web shell tests                                             | Pass: `32/32`.                                                                                                                                                                                                  |
| TypeScript and API build checks                             | Pass: direct typechecks for contracts/API/web and direct API build.                                                                                                                                             |
| Prisma preparation                                          | Pass: direct generate with a local-only `DATABASE_URL`; no database connection.                                                                                                                                 |
| Compose configuration                                       | Pass: `docker compose config --quiet` with safe dummy values; configuration only.                                                                                                                               |
| Contracts package dry-run                                   | Pass without publishing: `npm pack --dry-run --json` returned `@repomentor/contracts@0.1.0` with `33` local entries, including `dist/.test-dist` produced by test compilation. This is not an approved payload. |
| Frozen dependency install                                   | `pnpm run deps:install` installed the dependency tree but exited with `ERR_PNPM_IGNORED_BUILDS` while requesting build approval. No approval was enabled; this is an environment/tooling limitation.            |
| Live Docker and dependency checks                           | Not run: `docker info` could not connect to the local Docker Desktop Linux engine. No image build, Compose startup, or HTTP smoke is claimed.                                                                   |
| Full root suite, web production build, and release workflow | Not run in this docs refresh. Do not infer them from the passing focused checks above.                                                                                                                          |

## Current checkpoint addendum — 2026-08-08

The merged implementation checkpoint `4b2dfb7` passed API `250/250`, web
`42/42`, and contracts `7/7`; root typecheck, lint, format check, production
build, and package payload verification also passed. The authenticated usage
and review transports emit a Bearer header only for a current memory-only
access token; guest usage remains an explicit fixture boundary. Web logout
validates the API-owned refresh-cookie response before clearing its memory-only
access token. The review workspace requests the API cancel boundary when an
authenticated run is reset, superseded, or unmounted, and accepts only a
strict `CANCELLED` response. Playwright discovery is
`1/1`, but the browser run is not claimed because Chromium revision
`chromium-1161` is unavailable locally. No Docker image, registry artifact,
semantic tag, public package, GitHub release, or deployment was created.
Live PostgreSQL, Redis, HTTP provider, external Luna, and Docker daemon
evidence remain unverified.

The validation table above is historical evidence from the earlier docs
refresh; rerun all release gates on the exact tag commit before publication.

## Container workflows and release gates

### Pull request and main validation

`.github/workflows/container-validation.yml` is the no-publish validation
workflow. Its static job runs workflow syntax validation, Hadolint, Dockerfile
contract checks, and `docker compose config --quiet` with safe dummy values.
Its build job builds the API and web images for `linux/amd64` with
`push: false`, then smoke-tests API `/health/live` and the web `/` shell. This
workflow definition is a gate, not evidence that a current GitHub run passed.

### Tagged dual-registry release

`.github/workflows/container-release.yml` is prepared for a real tag and has
not published an image in this checkpoint. It requires a strict semantic tag
such as `v1.2.3` or `v1.2.3-rc.1`, a full 40-character `GITHUB_SHA`, a
lowercase `DOCKERHUB_NAMESPACE` repository variable, and configured
`DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets. It logs into GHCR with
`GITHUB_TOKEN` and Docker Hub with the explicit Docker Hub secrets.

The intended image formulas in the workflow are:

- GHCR: `ghcr.io/jasontm17/repomento-api` and
  `ghcr.io/jasontm17/repomento-web`;
- Docker Hub: `docker.io/${DOCKERHUB_NAMESPACE}/repomento-api` and
  `docker.io/${DOCKERHUB_NAMESPACE}/repomento-web`.

These are workflow-configured intended names, not proof that the namespaces,
repositories, ownership, or images exist. The hard-coded GHCR root and the
Docker Hub namespace have not been externally confirmed here. Confirm the
final image names and namespace before any real tagged run; no registry
publication or registry state is claimed.

For each API/web image, the release workflow must pass all of these gates:

1. Build one multi-architecture staging artifact for `linux/amd64` and
   `linux/arm64`, pushing staging references to both registries.
2. Resolve and compare GHCR and Docker Hub staging digests.
3. Scan both staging references for HIGH and CRITICAL OS/library
   vulnerabilities with the workflow's fail-closed Trivy settings.
4. Promote the scanned digest to the semantic version and
   `sha-${GITHUB_SHA}` tags in both registries without overwriting existing
   release tags.
5. Verify that all four promoted references remain digest-aligned with the
   scanned staging digest.
6. Generate and verify an SPDX SBOM, attach provenance and SBOM attestations
   to the final digest in both registries, and upload digest evidence.

Publication may be claimed only after the exact tagged commit has these CI,
scan, digest, SBOM, and provenance records. Image publication is not
application deployment or production-readiness evidence. This worker created
no tag, did not run the release workflow, and did not publish or deploy.

## Private package boundary

The root package and every current workspace package remain private. No
`private` flag was changed, no `npm publish` or `pnpm publish` was run, and no
public registry artifact is claimed. `@repomentor/contracts` is the only
current package treated as a future publication candidate; it remains
private today. The API, web, ESLint configuration, and TypeScript configuration
packages remain internal workspace packages.

The non-publishing `@repomentor/contracts` pack dry-run in this task returned
JSON for version `0.1.0` with `33` entries. Because test compilation had
already produced `dist/.test-dist`, the result is evidence to review, not an
approved release payload. A future package check must run from a clean build
output and verify the exact allowlisted payload, entry points, exports,
dependency policy, and consumer install/compile behavior.

Before any package publication, the owner must explicitly decide and record:

- the repository/package license and matching metadata;
- the candidate package, version, files, entry points, exports, and dependency
  policy;
- a clean `npm pack --dry-run --json` or equivalent exact payload check with no
  test-only artifacts;
- provenance, integrity, source-commit, and supply-chain evidence; and
- a consumer check that installs the packed artifact and exercises its public
  imports/types.

No package publication is authorized by this documentation refresh.

## License gate

There is currently no repository `LICENSE` file and no `license` field in the
root or workspace package metadata. The project owner must make an explicit
license decision before adding legal or publication metadata. A public package
or release remains blocked until the authorized license, exact payload, and
associated release checks are present. This task does not add a license or
flip package privacy flags.

## GitHub About metadata

The following are intended values derived from the committed root metadata.
They are discovery values only, not release, package, license, or deployment
evidence. This task did not change the external GitHub About fields and did not
verify their current external state.

| GitHub About field | Intended value                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Description        | `Developer-first AI code review and programming tutor workspace.`                                                   |
| Homepage / website | `https://github.com/JasonTM17/RepoMentor#readme`                                                                    |
| Topics             | `ai`, `code-review`, `programming-tutor`, `developer-tools`, `typescript`, `nextjs`, `nestjs`, `prisma`, `monorepo` |

## Media boundary

The checked-in `docs/media/repomentor-ui.gif` is a real capture of the
running Next web UI shell at static routes. The claim is limited to that UI
shell capture. It does not show a live API session, authenticated review data,
backend processing, PostgreSQL, Redis, Luna output, registry publication, or
deployment, and no new media capture was run in this documentation refresh.
