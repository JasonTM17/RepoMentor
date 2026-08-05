# RepoMentor release notes and artifact boundaries

This note defines the release boundary for the implemented application
checkpoint. It is documentation, not a deployment or package-publication
claim.

## Current checkpoint

- Base implementation: [`5ccb4cb`](https://github.com/JasonTM17/RepoMentor/commit/5ccb4cb)
- Root version: `0.1.0`
- Suggested release posture: prerelease only, for example `v0.1.0-alpha.1`
- Root package: `private: true`
- Publication status: no package artifact is published by this repository
- Deployment status: no deployment is performed or certified by this worker

The checkpoint has a working web shell, API auth/review boundaries, shared
contracts, Prisma migrations, and deterministic tests. It does not include a
live PostgreSQL or Redis proof, a live AI provider, a worker, review results,
CI publication, or deployment evidence.

## Tag and prerelease boundaries

Use an annotated, immutable tag only after the exact commit intended for the
release has passed the repository checks. Until the missing integration and
release gates are satisfied, use a prerelease tag such as `v0.1.0-alpha.1`
and describe it as an application checkpoint.

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
package were prepared: 16 web tests, 5 contract tests, 40 API tests, static
web routes for `/`, `/_not-found`, `/login`, and `/register`, and a valid
Prisma schema. Prisma checks used a local-only URL and did not connect to a
database. No live PostgreSQL, Redis, AI, deployment, or authenticated browser
session was verified.

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

These values are prepared for manual entry. This worker does not call GitHub
APIs or mutate repository settings.

| Field              | Value                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Description        | `Developer-first AI code review and programming tutor workspace.`                                                   |
| Website            | Leave blank until a real deployed URL exists.                                                                       |
| Topics             | `ai`, `code-review`, `programming-tutor`, `developer-tools`, `typescript`, `nextjs`, `nestjs`, `prisma`, `monorepo` |
| Homepage reference | `https://github.com/JasonTM17/RepoMentor`                                                                           |
