# RepoMentor release notes and artifact boundaries

This note defines the release boundary for the post-integration application
checkpoint. It is documentation, not a deployment or package-publication
claim.

## Current checkpoint

- Post-integration base: [`369c9588`](https://github.com/JasonTM17/RepoMentor/commit/369c9588f9cc0a51c28794272185b21f42394c2f)
- Root version: `0.1.0`
- Release/tag status: no release or tag is claimed by this checkpoint
- Root package: `private: true`
- Publication status: no package artifact is published by this repository
- Deployment status: no deployment is performed or certified by this worker

The checkpoint has a working web shell, API auth/review boundaries, an
authenticated synchronous review-processing and persisted-result transport,
an isolated Luna provider boundary, shared contracts, Prisma migrations,
deterministic tests, local API/web Compose services, and credential-free
container validation. The Luna boundary fixes the provider/model, validates
strict bounded results, isolates untrusted source from instructions, and
exposes typed retry/timeout/cancellation/error handling. It does not include a
live PostgreSQL or Redis proof, a live AI call, queue/worker runtime, application
usage or quota accounting, SSE result streaming, connected editor, registry
publication, or deployment evidence.

## Tag and prerelease boundaries

No release or tag is created or claimed by this checkpoint. Use an annotated,
immutable tag only after the exact commit intended for a release has passed
the repository checks and the remaining execution and release gates are
satisfied.

Do not move a tag after publication. If a correction is required, create the
next prerelease or release tag at a new commit. Release notes should name the
exact commit SHA, the checks that ran, and every unavailable integration.

## Package boundary

The root package and workspace packages are private. The metadata added to the
root `package.json` improves repository discovery, but it does not make the
monorepo publishable. Do not run `npm publish`, `pnpm publish`, or a registry
release from this checkpoint.

Before any future package publication, the project must explicitly decide:

- which workspace package is the public artifact;
- its `files`, entry points, exports, provenance, and dependency policy;
- whether a public license is available and recorded;
- how the exact package payload is tested and tied to the release commit.

## Immutable artifact expectations

Any future first-party image or package publication should retain, at minimum:

- the source commit SHA and semantic/prerelease tag;
- immutable registry digest or package integrity value;
- SBOM and provenance attestation where the publishing system supports them;
- the exact validation and security-scan results used for release acceptance.

An artifact being built or pushed is not the same as the application being
deployed or production-ready. This worker does not publish or deploy anything.

## Validation evidence for this checkpoint

The documented local sequence was:

```text
pnpm run deps:install
pnpm db:generate
pnpm --filter @repomentor/contracts build
pnpm db:validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

Results were successful after the generated Prisma client and shared contract
package were prepared: 16 web tests, 5 contract tests, and 86/86 API tests
(107/107 total).
The focused AI suite passed 22/22; the deterministic tests did not call a live
network. The normal API test command discovers the nested Phase 06 tests.
Static web routes for `/`, `/_not-found`, `/login`, and `/register`, and a valid
Prisma schema were also evidenced. Prisma checks used a local-only URL and did
not connect to a database. The historical GitHub Actions run
[`31030844884`](https://github.com/JasonTM17/RepoMentor/actions/runs/31030844884)
passed workflow/Dockerfile lint, Compose config, API/web image builds, and
HTTP smoke for `/health/live` and `/`; it is infrastructure evidence, not
proof of a live AI call. No live PostgreSQL, Redis, or AI call, queue/worker
runtime, usage/quota accounting, SSE stream, deployment, registry publication,
or authenticated browser session was verified. Processing/result transport
evidence is deterministic and uses in-memory repositories plus a fake Luna
provider.

The Luna boundary is server-side only: `LUNA_API_KEY` is not exposed to
clients, and `LUNA_API_BASE_URL` is fixed to the deployment-owned HTTPS
allowlisted endpoint `https://api.openai.com/v1`. Optional DeepSeek RAG
suggestions remain disabled and deferred under ADR-001; no DeepSeek secret is
added, documented, or stored.

The UI GIF in `docs/media/repomentor-ui.gif` is a real capture of the running
Next UI shell at `/`, `/login`, and `/register`. It is not a visual-regression
baseline, a live-session proof, or a backend demonstration. Recreate it with:

```powershell
pnpm --filter @repomentor/web build
pwsh -File docs/media/capture-ui-media.ps1
```

## License gate

There is currently no repository license file and no `license` field in the
root package metadata. This is intentional: no license is invented from the
existing source. A public release or package publication is blocked until the
project owner adds a license supported by repository evidence and updates the
release record.

## GitHub About metadata

These settings are already applied externally. This note records the applied
values and keeps them aligned with the root package metadata.

| GitHub About field | Applied value                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Description        | `Developer-first AI code review and programming tutor workspace.`                                                   |
| Homepage / website | `https://github.com/JasonTM17/RepoMentor#readme`                                                                    |
| Topics             | `ai`, `code-review`, `programming-tutor`, `developer-tools`, `typescript`, `nextjs`, `nestjs`, `prisma`, `monorepo` |
