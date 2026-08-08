# Testing strategy

The repository uses deterministic tests as the merge gate and records live
integration limits separately. The current evidence baseline is
`a8439bfa3fd03405a3ed26f0cbdefe06b6c736bb`; see [docs/release.md](release.md)
and [docs/ci.md](ci.md) for the checkpoint ledger.

## Test layers

### Contracts

The contracts package builds its test TypeScript and runs its Node test suite.
Build contracts before API tests because the API consumes the workspace package:

```text
pnpm --filter @repomentor/contracts build
pnpm --filter @repomentor/contracts test
```

### API

The API test script builds test TypeScript and runs Node's test runner over the
compiled test tree. It covers auth, health, guest review, AI policy/provider
adapters, review processing, Redis primitives/executors, quota admission,
usage/history, security transport, and Prisma repository seams. Most
integration-shaped tests use in-memory repositories, fake Luna, or deterministic
Redis executors.

```text
pnpm --filter @repomentor/api test
```

### Web

The web shell tests exercise route and UI contracts, including authenticated
settings and review detail behavior. The production build and TypeScript/lint
checks are separate gates:

```text
pnpm --filter @repomentor/web test
pnpm --filter @repomentor/web typecheck
pnpm --filter @repomentor/web lint
pnpm --filter @repomentor/web build
```

Playwright discovery is available through `pnpm --filter @repomentor/web e2e`,
but no browser execution is claimed when the required Chromium revision is not
installed.

## Static and package gates

The root checks are:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm package:check
pnpm db:validate
pnpm db:generate
pnpm audit --audit-level=high
```

`package:check` inspects package payloads without publishing. The dependency
audit is fail-closed; a high/critical advisory is a visible blocker, not a
reason to bypass the check. Credential-shaped scans and `git diff --check` are
also required for integration.

The canonical CI ordering and permissions are in
[`application-gates.yml`](../.github/workflows/application-gates.yml). The
container workflow separately validates Dockerfiles/Compose and performs
no-publish image builds when a Docker runner is available.

## Evidence boundaries

Passing deterministic tests proves the tested code paths with their fakes and
in-memory seams. It does not prove:

- a reachable PostgreSQL instance, migration application, transaction
  isolation, or backup/restore procedure;
- live Redis authentication, `EVAL`, quota admission, streams, or a
  multi-instance process-lock lease;
- external Luna HTTP access, model output quality, provider quota, or latency;
- browser execution, real authenticated UI flows, or a production build
  serving behind a proxy;
- Docker daemon startup, Compose dependency health, registry publication,
  GitHub release, or deployment.

Those claims require a separate environment with explicit credentials and
recorded run identity. Do not add real secrets to make a local deterministic
test appear live.
