# Commit, branch, and worktree strategy

RepoMentor uses small, reviewable Conventional Commits and exact-head
integration. The goal is to make each change independently testable and to keep
dirty work from becoming an accidental merge source.

## Branch names

Use intent-based names with a project prefix, for example:

```text
feature/review-detail
fix/dependency-audit
ci/application-gates
docs/completeness
```

Do not create new branches with the `codex/` prefix. Preserve an existing branch
name when it is already attached to an active task. Each branch should start
from an explicitly recorded base and have one bounded owner/scope.

## Worktrees

Use an isolated worktree for parallel work. Before editing, record:

```text
git status --short --branch
git rev-parse HEAD
git rev-parse refs/heads/main
git worktree list --porcelain
```

Never use a dirty branch or another worker's worktree as a scratch directory.
Do not reset, checkout-away, recursively clean, or force-delete user work.
When a slice is complete, its worktree must be clean and its branch must point
to the exact commit that was validated.

## Conventional Commits

Use a type, optional scope, colon, and imperative subject. Examples:

```text
feat(review): add owner-scoped review detail transport
fix(security): harden API transport boundaries
ci(github): add application quality gates
docs(commit): add repository documentation set
```

Keep generated lockfile changes with the dependency change that requires them.
Keep documentation evidence updates separate from application behavior when
possible. Add a body only when it records an important boundary or migration
reason; do not paste secrets, provider bodies, source payloads, or tokens.

## Integration gate

The coordinator should verify, in order:

1. exact base and exact HEAD;
2. intended path scope and `git diff --check`;
3. focused tests/static checks and credential-shaped scan;
4. clean worktree and focused commit;
5. independent exact-head review where available;
6. merge/cherry-pick into the current main, then repeat root gates;
7. push the integrated branch and record `main`/`origin/main` alignment;
8. delete only completed branch/worktree references after equivalence is
   proven and any locked residue is preserved rather than force-removed.

No local commit, dirty branch, timed-out review, or no-publish container build
is by itself evidence of production completion. Record HOLD/UNVERIFIED states
and their next bounded slice.
