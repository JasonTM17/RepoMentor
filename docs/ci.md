# Application CI gates

`.github/workflows/application-gates.yml` runs on every pull request and on
pushes to `main`. It uses Node.js 24 and the repository's pinned pnpm 11
toolchain, restores the pnpm store cache, and installs the lockfile with
`--frozen-lockfile --ignore-scripts`.

The required job is deliberately deterministic and credential-free. It
validates and generates Prisma artifacts with a local-only dummy
`DATABASE_URL`, builds the shared contracts before API checks, runs the
contract/API/web unit and in-memory/static tests, then runs the repository-wide
`pnpm format:check`, lint, typecheck, web/API production builds,
package-payload verification, and
`pnpm audit --audit-level=high`. The audit is fail-closed: findings are not
hidden by `continue-on-error`, an allowlist, or a secret-backed registry login.

This workflow does not start PostgreSQL or Redis, call the external Luna
provider, run a browser journey, or build/publish Docker images. Those are
separate evidence boundaries: the existing
`.github/workflows/container-validation.yml` owns Dockerfile, Compose, image,
and HTTP-shell validation, while live services, browser execution, and Luna
calls require their respective runtime environments. A passing application
job therefore proves deterministic repository gates only, not deployment or
production readiness.

At the current `953e7da` baseline, the local credential-free
`pnpm audit --audit-level=high` reports no known vulnerabilities. The prior
three high advisories (`playwright`, transitive `effect`, and `js-yaml`) were
closed by the focused dependency commit `953e7da` through a patched Playwright
version and documented workspace overrides. Browser execution, live services,
external Luna, and hosted GitHub-run evidence remain separate and unclaimed.
