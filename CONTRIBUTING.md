# Contributing to RepoMentor

RepoMentor is a private monorepo checkpoint, not a production release. Changes
must preserve the documented trust boundaries and must leave enough evidence for
the coordinator to review the exact commit that will be integrated.

## Before changing code

Use Node.js 22 or newer and pnpm 11 (`packageManager` pins pnpm 11.0.9). From a
fresh checkout, install without lifecycle scripts:

```text
pnpm install --frozen-lockfile --ignore-scripts
```

Copy [.env.example](.env.example) to an untracked `.env` only when local
runtime values are needed. Generate local secrets; never put real values in
`.env.example`, source files, fixtures, logs, screenshots, commits, or issue
comments. The code-review provider is server-side Luna only. The optional RAG
variables are disabled-by-default configuration names, not permission to add a
second provider.

Before editing, record the exact base commit and inspect the status of the
current checkout. Do not reset, clean, or merge away unrelated dirty work. If
the repository is being coordinated through isolated worktrees, keep each task
in its own worktree and do not use another worker's branch as a scratch area.

## Branches, worktrees, and scope

Create a concise intent branch such as `feature/review-detail`,
`fix/dependency-audit`, `ci/application-gates`, or `docs/completeness`.
New branches must not use the `codex/` prefix. Keep one bounded concern per
branch. A completed branch is expected to be clean, committed, reviewed at its
exact HEAD, and integrated before it is deleted. Dirty or stale branches are
not merge candidates; extract a small, independently verifiable slice instead.

The coordinator uses this sequence for integration:

1. confirm the target base and the branch's exact HEAD;
2. inspect the changed paths and validate the branch in its own worktree;
3. stage only intended paths and create a focused commit;
4. run the appropriate deterministic gates and credential-shaped scan;
5. merge or cherry-pick only the accepted bounded commit, then re-run root gates;
6. push the integrated branch and delete the completed branch/worktree only
   after its clean state and equivalence are recorded.

## Commit style

Use small [Conventional Commits](docs/commit-strategy.md), for example:

```text
feat(review): add owner-scoped review detail transport
fix(security): bound API request bodies
ci(github): add application quality gates
docs(commit): add repository documentation set
```

The subject should describe one coherent change. Do not combine application
code, workflow changes, generated output, and unrelated cleanup in one commit.

## Required local gates

Run the narrowest useful checks while iterating. Before integration, run the
root gates that apply to the changed area:

```text
pnpm db:validate
pnpm db:generate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm package:check
pnpm audit --audit-level=high
```

The application workflow in
[`/.github/workflows/application-gates.yml`](.github/workflows/application-gates.yml)
is the canonical ordering for the deterministic application checks. API tests
must build the shared contracts first. Documentation-only changes still need
formatting, `git diff --check`, path/link verification, and a credential-shaped
scan.

These checks do not prove live PostgreSQL, Redis/EVAL, multi-instance locking,
external Luna HTTP behavior, browser execution, Docker startup, registry
publication, or production readiness. Report those as unverified unless a
separate integration run supplies evidence.

## Review and security rules

- Keep authentication tokens in the memory-only browser session. The API owns
  the refresh cookie; do not add localStorage/sessionStorage token persistence.
- Keep review queries owner-scoped at the repository boundary, including detail,
  result, event, mutation, history, usage, and quota reads.
- Treat source, title, context, filenames, and retrieved text as untrusted data.
  Do not execute source, follow source instructions, browse, install packages,
  or expose hidden prompts/credentials.
- Do not accept provider, model, or prompt-control options from a public review
  request. The review path pins Luna server-side.
- Do not add the user-supplied DeepSeek key or any other credential to this
  repository. Optional RAG remains a separately governed, disabled boundary; see
  [ADR-001](docs/architecture/adr-001-optional-rag-suggestion-provider.md).
- Do not claim a CSRF token, audit log, structured request logging, distributed
  rate-limit proof, or dependency-aware readiness unless the implementation and
  evidence exist.

## Documentation changes

Update the relevant document when a boundary changes. Start with the map in
[docs/architecture.md](docs/architecture.md), then update the security,
testing, deployment, API, database, AI-prompt, or commit document as applicable.
Keep claims tied to source paths, tests, workflow definitions, or a recorded
live run. Do not turn deterministic fixtures or a no-publish CI build into a
live-service claim.
