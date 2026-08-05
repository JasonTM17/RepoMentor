# Phase 13 — CI, Docker, and documentation

## Dependencies and ownership

- Depends on Phase 12.
- Docker worker owns Dockerfiles, Compose production/local hardening, and
  `.dockerignore`.
- CI worker owns GitHub Actions and security scan configuration; root workflow
  edits are sequenced.
- Docs worker owns README, docs, and ADRs; docs claims must match evidence.

## Commit slices

- `build(docker): add production web and API images`
- `ci(github): add lint test and build pipeline`
- `ci(security): add dependency and code scanning`
- `docs(architecture): document system boundaries and decisions`
- `docs(deployment): add local and production deployment guide`
- `docs(project): complete security testing and commit documentation`

## Acceptance and validation

Images are multi-stage/non-root/health-checked and do not contain secrets;
Compose starts web/api/postgres/redis; CI runs install/lint/typecheck/tests/
Prisma/build/Docker validation; README and required docs/ADRs are complete and
truthful about live integration limitations.
