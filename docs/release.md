# RepoMentor release notes and artifact boundaries

This note describes the public RepoMentor repository and its release
boundaries. The root and workspace packages remain private. This documentation
records the verified `v0.1.4` container artifact release; that publication is
not evidence of a live deployment or production readiness.

## Source/evidence baseline

- Current runtime release checkpoint: `c3d1fe8`.
- Prior application evidence checkpoint: `5453e8c`; docs-only commits do not
  change its runtime inputs.
- The auth password-change slice was integrated as `0813d54`; the review
  metadata contract was integrated as `d955eaf`; the settings slice was
  integrated as `0bc05c7`; and the security transport slice was integrated as
  `2b146a5` from worker commit `e5d97ad`; review detail, CI gates, and
  dependency remediation were integrated through `953e7da`; the current exact
  head also includes the application-gate same-origin test fix at `5453e8c`.
- Tagged container release `v0.1.4` points to the full runtime commit
  `c3d1fe81928062929009e58d47c911ee8d5625ec`.
- The final plan/report addendum is authored in the bounded documentation
  refresh that follows this checkpoint.
- The earlier application checkpoint `5453e8c` is the exact-head evidence anchor for the local checks recorded in
  the current checkpoint addendum; they do not establish a tag, release,
  registry artifact, license, deployment, or production certification.

## Current unreleased `main` boundary — 2026-08-08

The release checkpoint above remains `c3d1fe81928062929009e58d47c911ee8d5625ec`.
The current `main` and `origin/main` heads are aligned at
`2ec543b060a56f43b24026e8a69bb51af0c7228c`. This current head is unreleased:
the 15 post-tag commits and 29 changed paths are not folded into `v0.1.4`.
They include migration/seed commands, offline Prisma migration-image
hardening, owner-scoped review-history API controls, and the authenticated web
history workspace. See the [current-head continuation report](../plans/reports/20260808-repomento-continuation.md)
for exact CI, arbiter, branch, provenance, and open-gate evidence.

## Current status

- Root package: `repomento@0.1.0`, `private: true`.
- Workspace packages: `@repomentor/api`, `@repomentor/web`,
  `@repomentor/contracts`, `@repomentor/eslint-config`, and
  `@repomentor/typescript-config`; all are `private: true`.
- No repository `LICENSE` file or package `license` field is present, and no
  license decision is invented here.
- No npm/public package artifact was published; all workspace packages remain
  private.
- GitHub Release `v0.1.4` is published with no uploaded release assets.
- Container release workflow run `31247857378` published the verified API/web
  images to GHCR (GitHub Packages) and Docker Hub. Neither publication is a
  deployment.
- GitHub About metadata was updated and verified: description, homepage, and
  repository topics are set to the values recorded below.

## Tagged container artifact — `v0.1.4`

The exact tag points to runtime commit
`c3d1fe81928062929009e58d47c911ee8d5625ec`. [GitHub Release
v0.1.4](https://github.com/JasonTM17/RepoMentor/releases/tag/v0.1.4) was
published after [Container release workflow run
31247857378](https://github.com/JasonTM17/RepoMentor/actions/runs/31247857378)
completed successfully for both matrix entries. The release record has no
uploaded assets; the images are published separately in GHCR and Docker Hub.

| Image | GHCR / GitHub Packages semantic ref     | Docker Hub semantic ref                       | Verified manifest digest                                                  |
| ----- | --------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| API   | `ghcr.io/jasontm17/repomento-api:0.1.4` | `docker.io/nguyenson1710/repomento-api:0.1.4` | `sha256:8c2e87733282882764664cfa6a818bb27abc585036601843bfa6ecdbe293cf0a` |
| Web   | `ghcr.io/jasontm17/repomento-web:0.1.4` | `docker.io/nguyenson1710/repomento-web:0.1.4` | `sha256:fc0ce52184144923a89cd4b60cf582fde711f325facad794b9938a93d5b290bf` |

Each image also has the workflow-protected semantic and
`sha-c3d1fe81928062929009e58d47c911ee8d5625ec` tags in both registries. The
workflow digest artifacts and direct `docker buildx imagetools inspect`
verification reported the same digest for all four refs of each image. The
workflow also passed multi-architecture `linux/amd64`/`linux/arm64` builds,
staging digest equality, Trivy HIGH/CRITICAL scans with unfixed findings
ignored, final digest equality, SPDX SBOM generation, and SBOM/provenance
attestation uploads to both registries.

Digest-pinned pulls are the reproducible form:

```text
docker pull ghcr.io/jasontm17/repomento-api@sha256:8c2e87733282882764664cfa6a818bb27abc585036601843bfa6ecdbe293cf0a
docker pull ghcr.io/jasontm17/repomento-web@sha256:fc0ce52184144923a89cd4b60cf582fde711f325facad794b9938a93d5b290bf
```

The release is a registry artifact publication. Digest-pinned references are
the reproducible, content-addressed form; the workflow refuses to overwrite
the release refs but no registry retention policy is claimed. The release does
not prove live PostgreSQL, Redis, HTTP provider, external Luna, browser,
multi-instance, or production deployment behavior.

### Release evidence limits

- The workflow logs and successful `actions/attest` steps prove the SBOM and
  provenance publication steps ran; this record does not include a separate
  public attestation-verification command or permanent attestation report.
- The digest artifacts uploaded by run `31247857378` are temporary GitHub
  Actions artifacts with an expiration date. The exact digests and workflow
  link are copied into this repository so the release record remains readable.
- Direct manifest inspection verified all eight public semantic/SHA-qualified
  refs. GitHub Packages REST metadata could not be queried from the available
  CLI token because it lacks `read:packages`; no stronger package-API claim is
  made here.
- Tag `v0.1.4` is annotated but not cryptographically signed. Digest identity,
  workflow gates, and source-commit linkage are the evidence recorded here.

## Current implementation boundary

### Authenticated quota admission

`POST /api/v1/reviews` is protected by the API access guard and requires a
bounded `Idempotency-Key`. The server canonicalizes the language with NFC,
trim, and lowercase normalization, preserves source as untrusted data,
resolves an omitted mode to `STANDARD`, and rejects a null or invalid mode
before mutation.

The server normalizes and hashes idempotency material, then computes a
version-2 HMAC-SHA-256 request fingerprint over the canonical source,
language, mode, learner level, and bounded title/context metadata. It creates
an owner-scoped durable `QuotaAdmission`
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

The review processing route also acquires a per-review `SET NX PX` lease,
renews it with an owner token, fences terminal writes after lease loss, and
releases it best-effort. This is deterministic multi-worker coordination
logic; no live multi-instance Redis run was performed.

The reusable review lock primitive uses `SET NX PX` with an opaque bounded
token and compare-and-delete Lua release. The processing route is the current
consumer of that primitive; the deterministic lease/fencing tests do not prove
a live multi-instance Redis deployment.

### HTTP transport boundary

The current API bootstrap validates a comma-separated CORS allowlist. Production
requires an explicit non-empty allowlist; development/test defaults are bounded
to local HTTP origins. Allowed origins are echoed exactly with credentials and
`Vary: Origin`; denied origins receive a safe request-id error without origin
reflection. JSON and URL-encoded bodies are limited to `128kb`, malformed or
oversized bodies use bounded error envelopes, and the transport emits CSP,
HSTS in production, frame/content/referrer policies, and an explicit disabled
Express fingerprint header.

This slice does not claim a synchronizer/double-submit CSRF token, structured
audit logging, or distributed rate-limit enforcement. Cookie SameSite defaults
remain the current baseline; any future cross-site `SameSite=None` flow needs an
explicit CSRF design first.

### Explicit deferred boundaries

- `POST /api/v1/guest/reviews` is implemented as a transient QUICK endpoint
  with server-controlled Luna metadata and bounded Redis quota admission;
  live Redis and external Luna execution were not run locally.
- Authenticated processing is synchronous and exposes status-only SSE with
  exclusive replay, bounded heartbeat/lifetime, polling fallback, cancellation,
  and owner isolation. There is no durable background queue claim.
- The validated Luna result now includes bounded `education` data for improved
  source, unified diff, generated tests, and learning questions. The web UI
  renders these as text/code views and export actions; it never executes model
  output.
- Deterministic tests use fake Luna, in-memory repositories, and deterministic
  Redis executors. No live PostgreSQL migration/transaction isolation, Redis
  `EVAL`, HTTP provider, or external Luna call was run for this refresh.
- Authenticated web usage pages use a memory-only Bearer transport when a
  session exists; guest pages retain deterministic/demo-labelled fixtures.
  Compose healthchecks cover process/HTTP shell liveness, not dependency-aware
  readiness.
- No deployment, production traffic, or production readiness follows from
  local tests, Compose configuration, or the published image artifacts.

## Validation evidence

The table below is historical evidence from the earlier documentation
refresh, before the current implementation checkpoint. It used Node
`v24.12.0`, pnpm `11.0.9`, safe non-secret test fixtures, and direct local
binaries where pnpm's nested install-status check was blocked. The current
checkpoint addendum follows the table.

| Check                                                       | Result                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API compile and deterministic tests                         | Pass: `193/193` tests across `39` suites, `0` failed and `0` cancelled.                                                                                                                                                                |
| Shared contracts tests                                      | Pass: `5/5`.                                                                                                                                                                                                                           |
| Web shell tests                                             | Pass: `32/32`.                                                                                                                                                                                                                         |
| TypeScript and API build checks                             | Pass: direct typechecks for contracts/API/web and direct API build.                                                                                                                                                                    |
| Prisma preparation                                          | Pass: direct generate with a local-only `DATABASE_URL`; no database connection.                                                                                                                                                        |
| Compose configuration                                       | Pass: `docker compose config --quiet` with safe dummy values; configuration only.                                                                                                                                                      |
| Contracts package dry-run                                   | Pass without publishing: `npm pack --dry-run --json` returned `@repomentor/contracts@0.1.0` with `33` local entries, including `dist/.test-dist` produced by test compilation. This is not an approved payload.                        |
| Frozen dependency install                                   | `pnpm run deps:install` installed the dependency tree but exited with `ERR_PNPM_IGNORED_BUILDS` while requesting build approval. No approval was enabled; this is an environment/tooling limitation.                                   |
| Live Docker and dependency checks                           | Not run locally: `docker info` could not connect to the local Docker Desktop Linux engine. No local service startup, live dependency check, or HTTP smoke is claimed; the separate GitHub no-publish validation run is recorded below. |
| Full root suite, web production build, and release workflow | Not run in this docs refresh. Do not infer them from the passing focused checks above.                                                                                                                                                 |

## Current checkpoint addendum — 2026-08-08

The prior merged application checkpoint `5453e8c` passed API `268/268`, web
`46/46`, and contracts `7/7`, plus root typecheck, lint, format check,
production build, package check, Prisma validate/generate, diff-check,
credential scan, and `pnpm audit --audit-level=high` with no known
vulnerabilities. It includes the authenticated password-change boundary,
persisted review title/context/learner-level metadata with version-2 request
fingerprints, the authenticated settings and `/reviews/[id]` routes, explicit
CORS/body-limit/security-header transport hardening, and the deterministic
application CI workflow. The
result contract is
strict and Luna-only, normalizes legacy persisted results with empty education
fields, and carries improved source, unified diff, generated tests, and
learning questions through the authenticated result API into text-only web
views, copy/download actions, and Markdown/JSON exports. No model output is
executed in the browser.

Hosted Application Gates run `31243141059` passed the deterministic application
checks at the docs-integrated repository head `7fd932d`, including web/API
builds, package verification, and the high-severity dependency audit. The
earlier run `31241219840` passed the unchanged runtime implementation head
`5453e8c`; the workflow fix keeps the web smoke tests same-origin and neither
run adds live database, Redis, browser, or external Luna evidence.

The guest QUICK route, Redis process lock, authenticated status-only SSE with
replay/polling fallback, logout, and cancellation boundaries are implemented
and covered by deterministic tests. Playwright discovery is `1/1`, but the
browser run is not claimed because Chromium revision `chromium-1161` is
unavailable locally. The later runtime container hardening commit `c3d1fe8`
was released as `v0.1.4`; its tagged dual-registry evidence is recorded above.
Live PostgreSQL, Redis, HTTP provider, external Luna, Docker Compose startup,
and multi-instance runtime evidence remain unverified.

GitHub Container Validation run `31241219843` passed against the runtime
implementation head `5453e8c`: workflow validation, Dockerfile and Compose contracts,
and both `linux/amd64` no-publish image builds. It is CI validation evidence
only; it is not a registry publication or deployment. Run `31204852778` remains
historical evidence for the earlier `4b2dfb7` checkpoint.

The validation table above is historical evidence from the earlier docs
refresh. That pre-release record required rerunning all release gates on the
exact tag commit; the requirement was subsequently satisfied by run
`31247857378`.

The earlier docs evidence head recorded here is `7fd932d`; the runtime release
checkpoint is `c3d1fe8`. Later docs-only commits do not change the runtime
inputs. Completed
settings/security refs were removed only after clean exact-head/equivalence
checks. The remaining `feature/auth-api` ref is clean but stale and unique;
`feature/history-filter-api` and `feature/review-process-lock-v2` remain dirty
and protected. No worktree residue was force-deleted.

The CI worker commits `295335b`, `f45b224`, and `a4b70d6` add the application
quality-gate workflow, repository-format step, and container-validation path
coverage. Kongminh accepted the exact worker head. Hosted Application Gates
run `31243141059` covers the docs evidence head; the hosted container run
above covers the unchanged runtime image inputs. Both remain deterministic/no-
publish evidence, not a deployment claim.

The dependency remediation commit `953e7da` updates Playwright to `1.55.1`
and pins patched transitive `effect` and `js-yaml` versions in
`pnpm-workspace.yaml`; the local high-severity audit is now clean.

## Container workflows and release gates

### Pull request and main validation

`.github/workflows/container-validation.yml` is the no-publish validation
workflow. Its static job runs workflow syntax validation, Hadolint, Dockerfile
contract checks, and `docker compose config --quiet` with safe dummy values.
Its build job builds the API and web images for `linux/amd64` with
`push: false`, then smoke-tests API `/health/live` and the web `/` shell. Run
`31241219843` passed against the runtime implementation head `5453e8c`; it did not use
registry credentials or publish images.
A passing validation run is not a registry publication or deployment claim.

### Tagged dual-registry release

`.github/workflows/container-release.yml` published `v0.1.4` successfully. It
requires a strict semantic tag
such as `v1.2.3` or `v1.2.3-rc.1`, a full 40-character `GITHUB_SHA`, a
lowercase `DOCKERHUB_NAMESPACE` repository variable, and configured
`DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets. It logs into GHCR with
`GITHUB_TOKEN` and Docker Hub with the explicit Docker Hub secrets.

The intended image formulas in the workflow are:

- GHCR: `ghcr.io/jasontm17/repomento-api` and
  `ghcr.io/jasontm17/repomento-web`;
- Docker Hub: `docker.io/${DOCKERHUB_NAMESPACE}/repomento-api` and
  `docker.io/${DOCKERHUB_NAMESPACE}/repomento-web`.

The `v0.1.4` run confirmed these names by logging in, pushing, resolving, and
comparing the final refs in both registries. The GHCR images are the GitHub
Packages container publication; the Docker Hub images use the configured
`nguyenson1710` namespace.

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

Publication is claimed here only because the exact tagged commit has these CI,
scan, digest, SBOM, and provenance records in run `31247857378`. Image
publication is not application deployment or production-readiness evidence.

## Private package boundary

The root package and every current workspace package remain private. No
`private` flag was changed, no `npm publish` or `pnpm publish` was run, and no
public npm package artifact is claimed. `@repomentor/contracts` remains a
future npm publication candidate; the API and web containers are a separate
GitHub Packages/Docker Hub artifact release. The API, web, ESLint
configuration, and TypeScript configuration packages remain internal workspace
packages.

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

No npm package publication is authorized by this documentation refresh; the
separately documented API/web container publication is already released.

## License gate

There is currently no repository `LICENSE` file and no `license` field in the
root or workspace package metadata. The project owner must make an explicit
license decision before adding legal or publication metadata. An npm/public
package still requires an authorized license, exact payload, and associated
release checks. This task does not add a license or flip package privacy flags;
the existing container artifact release does not resolve that open licensing
decision.

## GitHub About metadata

The following values are now set and verified on the external GitHub About
metadata. They are repository discovery metadata, not package, license, or
deployment evidence.

| GitHub About field | Verified value                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Description        | `Developer-first AI code review and programming tutor workspace.`                                                                          |
| Homepage / website | `https://github.com/JasonTM17/RepoMentor#readme`                                                                                           |
| Topics             | `ai`, `code-review`, `developer-tools`, `monorepo`, `nestjs`, `nextjs`, `postgresql`, `prisma`, `programming-tutor`, `redis`, `typescript` |

## Media boundary

The checked-in `docs/media/repomentor-ui.gif` is a real capture of the
running Next web UI shell at static routes. The claim is limited to that UI
shell capture. It does not show a live API session, authenticated review data,
backend processing, PostgreSQL, Redis, Luna output, registry publication, or
deployment, and no new media capture was run in this documentation refresh.
