# Continuation: release truth and current-head boundary

Date: 2026-08-08

This addendum is the current evidence boundary for RepoMentor. It supplements
the historical final report instead of rewriting it. The historical report
describes the checkpoint that existed when it was authored; this document
separates that checkpoint from the later tagged release and the current
unreleased `main` head.

## Decision summary

- The `v0.1.4` GitHub Release and dual-registry container artifact are
  accepted as a release artifact, not as a deployment or production-readiness
  claim.
- `main` and `origin/main` are currently aligned at `58a9a6a67d95e736dcc7a0a46e83315d89c031e8`.
  This is an unreleased post-`v0.1.4` head.
- The current web history and sensitive-action audit slices are integrated. They
  have deterministic evidence and hosted application/container validation, but
  no live browser journey or external AI/database deployment claim.
- Master-prompt traceability is recorded as derived evidence. The original
  attachment is outside the repository, so the repository does not claim that
  the full prompt is independently versioned in Git.
- License ownership remains an explicit open gate. No `LICENSE` file or
  package `license` field is invented by this continuation.

## Source identity and provenance

| Boundary | Exact identity | Disposition |
| --- | --- | --- |
| Historical deterministic checkpoint | `953e7da627d75bda394cdcfae2cee3a0199321be` | Historical evidence only |
| Released runtime tag | `v0.1.4` resolves to `c3d1fe81928062929009e58d47c911ee8d5625ec` | Released container/GitHub artifact |
| Current `main` and `origin/main` | `58a9a6a67d95e736dcc7a0a46e83315d89c031e8` | Current unreleased head |
| Prior docs-alignment candidate | `a32af2b02df7d06e0bedf13cd43bee2871fbfb12` | Superseded after arbiter requested explicit candidate provenance |
| Follow-up candidate recorded for arbitration | `468a81bd725a61247e4fde1bf57ef78eac8882c6` | Documentation-only follow-up; this predecessor identity is recorded before final re-arbitration |

There are 23 commits and 41 changed paths from `c3d1fe8` to the current
`main`. They are not silently treated as part of `v0.1.4`. The post-release
commits are:

```text
61392dc docs(release): record v0.1.4 registry evidence
41654f9 chore(database): add safe migration and seed commands
4ddd53d fix(container): add Prisma migration image target
24a74fb fix(compose): gate API startup on migrations
f5b51b5 fix(container): bake Prisma engine for migrations
8530807 ci(container): assert offline migration engine
8941c5c feat(review): add owner-scoped history filters
0b74df5 test(review): cover history filters and bulk delete
62e7b52 docs(api): document review history controls
fb756ae feat(web): add review history transport
239d047 feat(web): build authenticated review history workspace
3619bed test(web): cover review history boundary
eeb7327 fix(web): reject untrusted history envelope metadata
6b0873d docs: add current-head release continuation
2ec543b docs: record full current-head gates
a32af2b docs: align continuation with final main head
468a81b docs: record final alignment identity
73f57f5 docs: record arbiter predecessor identity
8bdbe59 feat(audit): record sensitive user actions
aef4fd7 docs(audit): record worker evidence and limits
075a267 feat(audit): cover guest review action
0be728a docs(audit): record coordinator verification counts
58a9a6a docs(audit): correct final verification report
```

The master-prompt attachment supplied for this project was live-hashed during
this continuation:

```text
Path: C:\Users\Admin\.codex\attachments\f57409b9-7413-4b5c-b370-278a6a490c2e\pasted-text.txt
SHA-256: FD7435754F354ADEFECE3361D279C22DE38D6507758D3BF86945E5A7F19BE75D
```

The hash records the provenance available to the coordinator. The attachment
is not copied into the repository and the acceptance mapping below is
therefore derived-only rather than a claim of committed prompt traceability.

## Current-head implementation slices

### Migration and seed boundary

`41654f9` adds explicit root/API migration and seed commands, a safe Argon2id
seed script, production guards, and explicit `SEED_USER_*` configuration. The
seed path is never treated as live production data evidence.

### Container migration boundary

`4ddd53d`, `24a74fb`, `f5b51b5`, and `8530807` add a dedicated migration image
target, Compose startup ordering, a Prisma engine baked into the migration
stage, and a CI assertion that the migration path does not require a network
download at runtime.

The prior bounded live Compose run used project
`repomentor-livefix-20260808`. It applied 10 migrations, observed 8 public
tables, returned Redis `PONG`, seeded one user through the migration image,
and observed internal API/web health. Host probes to the internal Compose
network were unavailable in that environment; this is an environment limit,
not a claim that host access is required. The exact Compose project was torn
down with volumes, orphans, and networks checked afterward.

### Owner-scoped review history API

`8941c5c`, `0b74df5`, and `62e7b52` add title, language, mode, status, order,
pagination, deterministic ordering, owner/deleted predicates, bounded bulk
soft-delete, tests, and API documentation. List and bulk-delete responses do
not include source code.

### Authenticated web history workspace

`fb756ae`, `239d047`, `3619bed`, and `eeb7327` replace the old fixture-bound
`/history` shell with an authenticated API seam. The workspace provides:

- server-side title/language/mode/status/sort filters;
- bounded pagination and deterministic empty/loading/error states;
- memory-only Bearer access plus `credentials: "include"`;
- strict owner-scoped, source-free list and delete response validation;
- page selection and bounded bulk soft-delete confirmation;
- signed-out guidance with no fixture fallback;
- responsive table/mobile cards at the existing 50rem and 30rem boundaries;
- focusable controls and reduced-motion-compatible transitions.

The final `eeb7327` fix strictly validates the outer API metadata keys
`requestId`, `page`, `pageSize`, and `total`. An unknown value such as
`meta.source` is rejected before UI state can consume the response.

### Sensitive-action audit logging

The audit slice is implemented by `8bdbe59` and `075a267`, with evidence and
report commits `aef4fd7`, `0be728a`, and `58a9a6a`. The exact report is
`plans/reports/20260808-security-audit-logging-worker.md`.

Its explicit allowlist covers sensitive auth/session/review actions, including
anonymous `POST /api/v1/guest/reviews`. Records are bounded to action, outcome,
actor user/session IDs when authenticated, request ID, canonical route, method,
status, time, and safe target IDs. Bodies, queries, auth headers, cookies,
tokens, passwords, source, prompt text, provider errors/secrets, and response
bodies are never captured. Persistence is asynchronous, fail-open, and
bounded to 250 ms; configured deployments use the Prisma adapter, while
deterministic boots without database configuration use a no-op sink.

This slice does not claim live PostgreSQL, Redis, Luna/provider, deployment, or
browser evidence. Guard failures before interceptor execution and best-effort
persistence remain documented limits.

## Validation evidence

### Current `main`

| Gate | Result | Evidence |
| --- | --- | --- |
| Hosted Application gates | Pass | [run 31265734227](https://github.com/JasonTM17/RepoMentor/actions/runs/31265734227), exact head `58a9a6a` |
| Hosted Container validation | Pass | [run 31265734234](https://github.com/JasonTM17/RepoMentor/actions/runs/31265734234), exact head `58a9a6a` |
| Full workspace deterministic gates | Pass, API 282 / web 48 / contracts 7 | Coordinator local `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and `pnpm package:check` |
| Sensitive-action audit tests | Pass, 11/11 | Coordinator local focused audit suite |
| Prisma validation/generation | Pass | Coordinator local `pnpm db:validate` and `pnpm db:generate` with a process-local non-secret configuration |
| Web shell/runtime tests | Pass, 48/48 | Local `pnpm --filter @repomentor/web test` |
| Web TypeScript | Pass | Local `pnpm --filter @repomentor/web typecheck` |
| Web lint | Pass | Local `pnpm --filter @repomentor/web lint` |
| Web production build | Pass | Local Next production build; `/history` generated successfully |
| Targeted formatting/diff | Pass | Prettier check and `git diff --check` |
| Credential-shaped scan | Pass | Coordinator high-signal scan found no credential-shaped match |
| Luna web arbiter | Accept | Historical `eeb7327` strict metadata fix; retained as historical evidence |
| Luna audit branch arbiter | Accept | Exact five-commit audit branch accepted in thread `019fe117-6249-7852-ad08-c9200cab1725`; worker thread `019fe12d-1385-7cc1-a974-332c6387cfaf` |
| Terra/Kongminh docs counsel | Advisory | Read-only documentation counsel; not implementation approval |

Hosted logs include Node 20 deprecation annotations; these are non-failing
warnings only. The deterministic and hosted results do not certify live
PostgreSQL, Redis, external Luna/provider, browser automation, or deployment.

The web evidence is deterministic/static and does not certify live
PostgreSQL, Redis, external Luna, browser automation, multi-instance SSE, or
deployment behavior.

### Released `v0.1.4` artifact

GitHub Release [v0.1.4](https://github.com/JasonTM17/RepoMentor/releases/tag/v0.1.4)
is published with no release assets. The tagged [Container release run
31247857378](https://github.com/JasonTM17/RepoMentor/actions/runs/31247857378)
completed successfully for runtime commit `c3d1fe8`.

| Image | GHCR / GitHub Packages | Docker Hub | Verified manifest digest |
| --- | --- | --- | --- |
| API | `ghcr.io/jasontm17/repomento-api:0.1.4` | `docker.io/nguyenson1710/repomento-api:0.1.4` | `sha256:8c2e87733282882764664cfa6a818bb27abc585036601843bfa6ecdbe293cf0a` |
| Web | `ghcr.io/jasontm17/repomento-web:0.1.4` | `docker.io/nguyenson1710/repomento-web:0.1.4` | `sha256:fc0ce52184144923a89cd4b60cf582fde711f325facad794b9938a93d5b290bf` |

The release workflow also recorded the SHA-qualified tags, multi-architecture
builds, digest equality, Trivy scan, SPDX SBOM, and provenance/SBOM
attestation steps. A separate public attestation-verification command and a
registry retention policy are not claimed. The available GitHub CLI token
could not query GitHub Packages REST metadata because it lacks
`read:packages`; the registry digest evidence above is not upgraded into a
stronger package-API claim.

## GitHub About and package boundaries

The public repository metadata was live-checked:

- description: `Developer-first AI code review and programming tutor workspace.`
- homepage: `https://github.com/JasonTM17/RepoMentor#readme`
- topics: `ai`, `code-review`, `monorepo`, `nestjs`, `nextjs`, `postgresql`,
  `programming-tutor`, `redis`, `typescript`, `developer-tools`, `prisma`;
- repository visibility: public;
- GitHub-detected license: none.

The root manifest and all five workspace manifests are `private: true`; no npm
package was published. There is no repository `LICENSE` file and no package
`license` field. Before any public npm package, reusable SDK claim, or legal
reuse statement, the owner must choose and commit the license policy and align
manifests/OCI metadata as appropriate. This continuation does not guess that
decision.

## Acceptance disposition and open gates

| Area | Disposition |
| --- | --- |
| Deterministic auth/review/history UI contracts | Pass for tested static/runtime boundaries |
| `v0.1.4` GitHub Release and dual-registry images | Pass as immutable release artifact |
| Current `main` hosted CI | Pass at `58a9a6a` for Application and Container gates in runs `31265734227` and `31265734234` |
| Prompt provenance | Recorded externally by path/hash; repository traceability remains derived-only |
| License/legal publication policy | Open owner decision |
| Live PostgreSQL transactions/isolation | Not certified by these checks |
| Live Redis/EVAL, lease, and multi-instance SSE | Not certified by these checks |
| External Luna/provider call | Not certified by these checks |
| Browser journey/visual regression | Not certified; Playwright browser execution remains unavailable locally |
| Production deployment/rollback/observability | Not certified |
| Independent attestation/SBOM verification | Open follow-up |

The open gates are intentionally not hidden by the successful release or CI
badges. The next bounded gap is RBAC, cost truthfulness, and live/browser/
deployment evidence. The next release must decide whether the post-tag
current-head slices are included, then publish a new exact tag with the same
evidence discipline.

## Branch and worktree ledger

Completed current-head web work:

- `feature/web-review-history` was based exactly on `62e7b52` and integrated
  through `eeb7327` after the Luna arbiter ACCEPT.
- Focused commits were `fb756ae`, `239d047`, `3619bed`, and `eeb7327`.
- The branch ref was deleted after fast-forward merge and push.
- Its worktree registration was removed, but normal worktree removal stopped
  because generated dependency/build residue left the directory non-empty.
  No force deletion was used; the residue is outside Git history.

Protected historical refs remain inventory-only and were not merged or
deleted:

| Worktree | Ref/head | State |
| --- | --- | --- |
| `C:\Users\Admin\.codex\worktrees\73d6\RepoMentor` | `feature/history-filter-api` / `1b0f82d` | Dirty, protected |
| `C:\Users\Admin\.codex\worktrees\d731\RepoMentor` | detached / `8662b6e` | Historical detached worktree |
| `D:\worktrees\RepoMentor-auth-api` | `feature/auth-api` / `be36e0e` | Clean but stale/unique |
| `D:\worktrees\RepoMentor-docs-completeness` | `docs/completeness` / `6e0c03f` | Clean but unmerged, protected |
| `D:\worktrees\RepoMentor-review-process-lock-v2` | `feature/review-process-lock-v2` / `5d25462f` | Dirty, protected |

No broad reset, force branch deletion, or unrelated worktree cleanup is part
of this continuation.

## AK supervision ledger

Current implementation and exact-head acceptance remained Luna-only. The
requested Terra High advisor was used as a read-only documentation/release
review and did not modify code or approve the Luna implementation.

| Role | Agent | Result |
| --- | --- | --- |
| Kongminh / Terra High advisor | `019fe0e2-13e1-7a60-89da-f54a35a71f21` | HOLD for docs until release/current-head boundaries, provenance, license, and ledger were recorded; release artifact itself accepted |
| Luna web arbiter | `019fe0f1-963c-70e1-a18f-aacbc38de181` | HOLD on permissive outer `meta` validation |
| Luna re-arbiter | `019fe0f6-e7de-7f11-8a3c-6a14c867b27e` | ACCEPT after `eeb7327` strict metadata fix |
| Luna docs-head arbiter | `019fe106-14f2-7b02-8b9a-f49d87308471` | ACCEPT after coordinator supplied exact final-head ancestry, clean status, four-path scope, and diff-check evidence |
| Luna audit branch arbiter | `019fe117-6249-7852-ad08-c9200cab1725` | ACCEPT for the exact five-commit sensitive-action audit branch |
| Audit worker | `019fe12d-1385-7cc1-a974-332c6387cfaf` | Implemented the bounded sensitive-action audit slice and report evidence |

Earlier Terra counsel in historical documents remains archival design input.
It does not authorize a model exception for current code implementation.

## Rollback and next action

The current-head web slice can be reverted with reviewed, focused reverts of
`eeb7327`, `3619bed`, `239d047`, or `fb756ae` in reverse order if a regression
is found. No reset or force-push is required.

The next bounded task is to keep this addendum and the append-only execution
plan aligned, then select the next acceptance gap (RBAC, cost truthfulness,
browser execution, or live integration) only after preserving
the protected worktree ledger. A new release tag must not be inferred from
this current unreleased `main` head.
