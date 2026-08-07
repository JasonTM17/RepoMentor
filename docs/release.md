# RepoMentor release notes and artifact boundaries

This note defines the release boundary for the current private monorepo. It is
documentation, not a deployment, registry-publication, or package-publication
claim.

## Current checkpoint

- Exact local checkpoint: `eab8131fdf8f6937b0e21c85aedc43c3e9e38013`, the output
  of `git rev-parse HEAD` in the documentation worktree.
- Accepted 09D2A admission integration: `0b573a2`; the repository plan records
  `192/192` API tests across 38 suites at that bounded integration checkpoint.
- Root version: `0.1.0`.
- Root package: `repomento`, `private: true`.
- Workspace packages: `@repomentor/api`, `@repomentor/web`,
  `@repomentor/contracts`, `@repomentor/eslint-config`, and
  `@repomentor/typescript-config`; all are `private: true`.
- Release/tag status: no tag or release is created or claimed by this
  checkpoint.
- Publication status: no npm/public package artifact, GHCR image, or Docker
  Hub image is published by this repository.
- Deployment status: no deployment is performed or certified by this worker.

The checkpoint contains authenticated quota admission on `POST /api/v1/reviews`:
the route requires a bounded `Idempotency-Key`, hashes idempotency material,
reserves an authenticated Redis quota admission, stores durable Prisma
`QuotaAdmission` state, carries versioned keyed request-fingerprint metadata,
and finalizes the preallocated review through the Prisma boundary. It also
contains the owner-scoped usage read model, Redis quota/lock primitives, the
server-owned Luna boundary, deterministic tests, local Compose services, and
the current fingerprint-secret configuration in `.env.example`, Compose, and
container validation.

These are bounded contract and configuration claims. No live PostgreSQL,
Redis/EVAL, HTTP provider, or external Luna call has been verified. The guest
HTTP route is not implemented, the Redis process-lock primitive is not wired
into processing, and no queue, production deployment, registry publication, or
public package publication is implied.

## Release and tag gates

No release or tag is created by this task. A future release must satisfy all of
the following gates on the exact commit intended for publication:

1. The project owner explicitly decides and records the repository license.
   There is no license decision or license file in this checkpoint.
2. The reviewed worktree is clean, the full source SHA is recorded, and the
   repository checks pass. The current API evidence is `192/192` across 38
   suites; the focused current admission evidence includes HTTP orchestration
   `10/10`, fingerprint configuration `6/6`, and fingerprint derivation `6/6`.
   These focused counts are included in, not added to, the API total.
3. The owner creates a real annotated semantic tag on that exact reviewed
   commit. The container workflow accepts `vMAJOR.MINOR.PATCH` and prerelease
   forms such as `v1.2.3-rc.1`; this task creates no tag.
4. GitHub release configuration is present: the workflow uses the GitHub token
   for GHCR package writes and requires the `DOCKERHUB_NAMESPACE` repository
   variable plus the `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets. The
   namespace must be lowercase and the secrets must be configured before a
   tagged run can publish.
5. Required CI succeeds for the exact tagged commit, including repository
   checks, container workflow validation, Dockerfile/Compose checks, image
   builds, and HTTP smoke checks. A historical successful container-validation
   run is infrastructure evidence, not proof for a new tag.
6. The release job completes its supply-chain gates: multi-architecture staging
   references are pushed to both registries, staging digests match, HIGH and
   CRITICAL vulnerability scans pass, semantic and full-SHA tags are promoted,
   all promoted references remain digest-aligned, SPDX SBOMs exist, and
   provenance/SBOM attestations plus digest evidence are available.
7. Only after all evidence is recorded may publication be claimed. A published
   image is still not proof of application deployment or production readiness.

## Container workflow boundary

`.github/workflows/container-release.yml` is prepared for a real tagged run;
it is not evidence that a run has happened. It triggers only from a `v*.*.*`
tag, builds `api` and `web` images for `linux/amd64` and `linux/arm64`, and
derives the GHCR names from `ghcr.io/jasontm17/repomento` and the Docker Hub
names from `DOCKERHUB_NAMESPACE`. It first pushes scan-only staging references
to both registries, then performs the digest, scan, promotion, SBOM, and
attestation gates described above.

The repository plan records GitHub Actions run
[`31030844884`](https://github.com/JasonTM17/RepoMentor/actions/runs/31030844884)
as passing workflow/Dockerfile lint, Compose validation, API/web image builds,
and `/health/live` plus `/` smoke checks for the earlier container slice. That
run is historical infrastructure evidence only. It is not a release tag, a
registry publication, a digest/provenance/SBOM record for this checkpoint, or a
deployment proof. No real tagged release run or registry evidence exists here.

## Private package boundary

The root package and every workspace package are private. Existing root
metadata provides repository discovery (`description`, repository URL, homepage,
keywords, and `private: true`); it does not make the runtime or workspace
packages publishable. No package metadata change is justified in this refresh,
and no `npm publish`, `pnpm publish`, or public registry claim is allowed from
this checkpoint.

Before any future package publication, the owner must explicitly choose the
public artifact and record its `files`, entry points, exports, dependency
policy, provenance, exact payload check, and license. A private monorepo package
must not be described as an npm release merely because it can be built or
packed locally.

## Validation evidence and limitations

The current exact-head API rerun passed `192` tests across `38` suites with
`192` passed and `0` failed. It uses deterministic Redis executors, in-memory
repositories, and a fake Luna provider. `pnpm db:generate`, the contracts build,
Prisma validation with a local-only URL, and `docker compose config --quiet`
with safe dummy values also pass; the latter validates configuration only.

The local Docker Desktop daemon was not running, so local Compose startup and
live PostgreSQL/Redis dependency health were not verified. No live Redis EVAL,
PostgreSQL transaction/isolation, HTTP provider, or external Luna evidence is
claimed. Guest admission, process-lock wiring, deployment, registry
publication, and public package publication remain deferred.

The UI asset at `docs/media/repomentor-ui.gif` is a real capture of the running
Next UI shell at `/`, `/login`, and `/register`. It is evidence of the media
capture only, not a release proof, visual-regression baseline, live-session
proof, backend demonstration, or deployment record.

## License gate

There is currently no repository `LICENSE` file and no `license` field in the
root or workspace package metadata. This documentation does not invent a
license. A public release or package publication is blocked until the project
owner makes and records an explicit license decision, adds the authorized
repository/package metadata, and reruns the release payload checks.

## GitHub About metadata

The table below keeps the intended GitHub About values aligned with the current
root package metadata. About text is discovery metadata, not a release,
publication, license, or deployment proof.

| GitHub About field | Aligned value                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Description        | `Developer-first AI code review and programming tutor workspace.`                                                   |
| Homepage / website | `https://github.com/JasonTM17/RepoMentor#readme`                                                                    |
| Topics             | `ai`, `code-review`, `programming-tutor`, `developer-tools`, `typescript`, `nextjs`, `nestjs`, `prisma`, `monorepo` |
