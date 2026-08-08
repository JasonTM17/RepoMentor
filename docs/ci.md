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

At the `30eafabbf47431fc0ef401c6919b524b0c11d409` baseline, the local
credential-free audit reports three high advisories in the dependency graph
(`GHSA-7mvr-c777-76hp`, `GHSA-38f7-945m-qr2g`, and
`GHSA-pm4m-ph32-ghv5`). The workflow intentionally reports that blocker until
the dependency owners remediate or explicitly review it.
