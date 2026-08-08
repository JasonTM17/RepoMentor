---
title: RepoMentor end-to-end delivery
status: in-progress
priority: P0
effort: epic
branch: main
tags: [repomentor, monorepo, auth, ai, security, orchestration]
created: 2026-08-05
---

# RepoMentor delivery plan

## Outcome contract

Build RepoMentor as a production-oriented AI code-review and programming-tutor
monorepo. The local result must support authenticated code reviews, safe
GPT-5.6 Luna analysis, persisted structured results, streaming progress,
history/usage controls, security boundaries, automated tests, Docker local
development, CI, and maintainer documentation.

This plan is an execution record, not a production certification. Live AI,
PostgreSQL, Redis, registry, deployment, and external credential checks are
reported separately and never inferred from unit or build evidence.

## Locked constraints

- Every RepoMentor worker, tester, reviewer, and manager agent uses only
  `gpt-5.6-luna`; use reasoning `max` whenever the live capability exposes it.
  A route that cannot verify or pin Luna is blocked rather than silently
  substituted.
- There is no model exception for the current continuation. Every advisor,
  counsel, worker, tester, reviewer, arbiter, and manager used for RepoMentor
  work is pinned to `gpt-5.6-luna` with priority service and max reasoning
  where supported. Historical Terra counsel rows below are archival context
  only and are not authorization for new work or acceptance decisions.
- Use AgentKit's `understand -> decide -> execute -> verify -> deliver` spine
  and the orchestration contract in `ak-orchestrate`.
- Parallel writers use isolated worktrees and disjoint ownership. Shared
  package manifests, lockfiles, Prisma migration sequence, generated artifacts,
  and root config are changed by one sequenced owner at a time.
- Branches are intent-based and never use the `codex/` prefix. Examples:
  `feature/monorepo-foundation`, `feature/auth-api`, `feature/review-domain`,
  `fix/security-review-boundary`.
- Every logical slice is validated before a focused Conventional Commit.
  Never use `git add .`; never commit secrets, `.env`, local AgentKit/Claude
  tooling, unrelated artifacts, or incomplete code.
- Preserve existing `.claude/` and `engineer/` tooling. The local
  `.git/info/exclude` hides them from product status without deleting them.
- User code is untrusted data and is never executed. AI output is untrusted
  until schema validation and domain checks succeed.

## Frontend and UI/UX quality contract

The requested `ak-fe` route is satisfied by the installed AgentKit frontend
skills `ak:frontend-design` and `ak:frontend-development`; the exact
capability is selected from the live skill catalog, not from an absent alias.
Every web slice must record and follow:

- a short Design Read, seeded aesthetic variation, and one-sentence aesthetic
  thesis before implementation; the RepoMentor product surface is treated as
  a focused product UI, not a generic landing-page template;
- token-first styling for colors, typography, spacing, radii, elevation, and
  motion, with a deliberate direction and no ad-hoc palette or magic values;
- complete interaction states: default, hover, focus-visible, active,
  disabled, loading, empty, error, and success where applicable;
- responsive composition verified at 375px, desktop widths, and keyboard
  navigation, including visible focus rings, semantic controls, 44px minimum
  targets, readable contrast, reduced-motion behavior, and no horizontal
  overflow;
- one consistent icon family with no emoji used as structural UI, realistic
  domain-specific copy, and a frontend self-review gate before acceptance.

UI code may not be accepted on a green build alone. The report must include
the design-system decision, state/accessibility checks, and a visual QA result
or a clearly recorded limitation when browser capture is unavailable.

## Starting evidence

| Fact | Evidence | Consequence |
| --- | --- | --- |
| Workspace was not a Git repository | `git status` failed before setup | Initialized local `main` only; worktrees now possible |
| Product source was absent | root contained `.claude/` and `engineer/` only | Start from foundation; do not sweep tooling into product commits |
| Root is a standalone repo | `ak-worktree ... info --json` | Use sibling worktrees under `D:\worktrees` |
| AgentKit wrapper has a broken relative require | wrapper execution failed with `MODULE_NOT_FOUND` | Use canonical skill script; preserve wrapper and report limitation |
| Luna is exposed by the live subagent/thread tool schemas | live tool inventory lists `gpt-5.6-luna`, reasoning through `max` | Pin Luna for all delegated project work and record route evidence |

## Phase map and dependency graph

| Phase | Deliverable | Depends on | Primary ownership | Exit evidence |
| --- | --- | --- | --- | --- |
| 00 | repository/tooling analysis | none | coordinator | inventory + plan commit |
| 01 | pnpm/Turbo/TypeScript/ESLint/Prettier foundation | 00 | foundation worker | install, lint, typecheck |
| 02 | Next.js web, NestJS API, shared package seams, health | 01 | web/API workers, sequenced config owner | both builds + health tests |
| 03 | Compose, Prisma tooling, PostgreSQL/Redis config checkpoint | 02 | infra/database worker | schema/config validation + compose config |
| 04 | secure auth API and web flows | 03 | auth API then auth web | auth integration tests + build |
| 05 | review persistence, ownership, pagination, status model | 04 | review API worker | domain/integration tests |
| 06 | Luna provider, prompt isolation, structured output, usage model | 05 | AI worker + security tester | schema/prompt/provider tests |
| 07 | processing pipeline, SSE, cancellation, retry, idempotency | 06 | processing worker | transition/stream tests |
| 08 | editor and result experience | 07 | web feature workers | component/E2E slices + web build |
| 09 | history, dashboard, quota, usage | 08 | web/API usage workers | quota/authorization tests |
| 10 | security hardening and threat-model evidence | 09 | security worker | security tests + audit |
| 11 | logs, request IDs, metrics, readiness | 10 | observability worker | health/metrics tests |
| 12 | full unit/integration/E2E quality pass | 11 | Luna tester | reproducible test report |
| 13 | production Docker, CI, docs, ADRs | 12 | DevOps/docs workers, sequenced CI owner | Docker/CI/docs checks |
| 14 | final arbiter and handoff | 13 | Luna manager/coordinator | clean reviewed HEAD + final report |

Implementation is phase-sequential. Within a phase, concurrency is allowed
only where the ownership table is disjoint and the integration point is
explicit. The coordinator owns merge/cherry-pick decisions and conflict
resolution.

Phase 02 is accepted at the integrated application checkpoint
`7c18e187d4d37601687e9e9373a28fb44eee7d6c`. It is an application and UI
foundation checkpoint, not a production or live-integration claim. Its full
orchestration evidence is in
`plans/reports/orchestrate-20260805T192444/report.md`.

Phase 04 is accepted at the current web-auth checkpoint `5ccb4cb`. Its first
independent checkpoints are the accepted transport contract commit `b22d1c7`
and web-auth sequence through `3c4252a`. The Luna API manager checkpoint is
integrated at `9413493` after the P1/P2 security review: 32/32 auth tests, API
gates, Prisma checks, registration enumeration protection, production cookie
invariant, bounded rate limits, contract-shaped login/refresh payloads, and
logout idempotence. The web worker reconciled the `202 accepted` registration
contract and strict success envelope with the UI/client seam through `5ccb4cb`.
This remains not a live PostgreSQL/Redis integration claim.

The user-requested DeepSeek V4 Flash integration is recorded in
`docs/architecture/adr-001-optional-rag-suggestion-provider.md` and
`phase-06-ai-integration.md`: it is a disabled-by-default server-side
`rag_suggestion` capability only, never a Luna code-review/worker substitute,
and requires later security, privacy, quota, and secret-governance gates.

Phase 06 is accepted on main at `369c958` after the exact Luna-owned commit
chain `75f05aa`, `0cae58c`, `901d1fc`, and `369c958`. The boundary pins Luna /
`gpt-5.6-luna`, validates bounded structured output, isolates untrusted source
framing, preserves typed timeout/retry/cancellation errors, validates the
fixed HTTPS endpoint, and keeps server-only runtime variables documented.
Normal API tests pass `62/62`, including `22` focused AI tests; API build,
lint, typecheck, Prettier, and diff-check pass. Luna manager arbitration and
Kongming/Terra security counsel both accepted the exact head. This is not live
AI or end-to-end review evidence; processing, persistence, usage/quota,
streaming, and the full result contract remain later-phase work.

Phase 07A is accepted on main at `6b2dfe4` after the exact Luna worker chain
`f8eb156 -> b907af0 -> ddaacb4`, integrated as `aab1d48` and `6b2dfe4`.
The slice adds a deterministic review-processing orchestration boundary with
owner-scoped claim/finalization ports, explicit COMPLETED/FAILED/CANCELLED/
SKIPPED outcomes, typed provider-error mapping, cancellation races, and
terminal-state idempotency. The Luna manager and Kongming/Terra counsel
accepted the exact worker head with no P0/P1 blockers. Post-merge evidence is
API `75/75`, focused processing `13/13`, web `16/16`, contracts `5/5`, API
build/typecheck/lint, root Prettier, and diff-check. The orchestration is not
yet wired to Prisma result persistence, a public processing route or queue,
SSE/reconnect transport, retry transport, live PostgreSQL/Redis, or live AI.

The post-merge auth hardening commit `0b47a45` rejects non-canonical Base64URL
token encodings at the verifier boundary. It was found by the post-cherry-pick
regression run and verified by the full API and root test suites; it does not
change the Luna or review-processing scope.

Phase 07B is accepted on main at `ce6222b`, a coordinator cherry-pick of the
exact Luna worker commit `3bddb27` based on `546acf5`. It adds bounded,
schema-validated `AiReviewExecution` persistence, one owner-scoped
`ReviewResult` with optional `ReviewUsage`, and an atomic Prisma transaction
that conditionally moves PROCESSING to COMPLETED before inserting the result
and usage. Resultless completion is blocked in both repositories; failed,
cancelled, duplicate, cross-owner, and racing paths do not create a successful
result. Evidence after merge is focused persistence/processing `18/18`, API
`80/80`, web `16/16`, contracts `5/5` (root `101/101`), Prisma validate and
generate, API build/typecheck/lint, root format, diff-check, and staged secret
scan. This remains a deterministic boundary: live PostgreSQL migration,
isolation/rollback, Redis, AI, route/queue, retry transport, SSE, and result
DTO evidence are still deferred. The manager and Kongming/Terra counsel found
no P0/P1 blocker; P2 follow-ups are database-level COMPLETED/result
enforcement and disposable PostgreSQL concurrency checks. The 07C synchronous
transport follow-up now carries a bounded persisted processing generation
fence; durable multi-worker leases remain later work.

Phase 07C is accepted on main at `cede60c` after the exact Luna worker chain
`ad32a51 -> 1ba9735 -> 3cea836 -> 65ebf48`, based on `81b6bbd` and integrated
as `41b65a9`, `e7caccb`, `54179dd`, and `cede60c`. The authenticated transport
adds `POST /api/v1/reviews/:id/process` and
`GET /api/v1/reviews/:id/result`, with server-owned Luna pinning, owner
isolation, validated result retrieval, source/provider-error redaction, safe
provider status mapping (504/503/429 plus unknown-failure 502), truthful ISO
timestamps, and explicit Swagger body/envelope schemas. The generation fence
atomically advances claims and prevents stale request A from finalizing,
failing, or cancelling retried request B. Post-merge evidence is API `91/91`,
root `112/112`, focused processing/persistence `22/22`, review E2E `13/13`,
API/root build, lint, typecheck, format, Prisma validate/generate, diff-check,
and staged secret scan. Luna manager and Kongming/Terra counsel accepted the
exact head with no P0/P1 blocker. P2 follow-ups are disconnect-to-abort and
outer-deadline handling, per-owner concurrency/quota controls, complete
Swagger schemas for generic result/usage objects, and live AI/PostgreSQL/
Redis/queue/SSE evidence.

Phase 08A is accepted on local main at `0c46164` after the exact Luna worker
chain `533cf73 -> c96988f -> 5eca1bf -> 9ea5afa -> 9aac007`, integrated as
`bd12761`, `6740d70`, `ec51172`, `011a516`, and `0c46164`. The `/reviews/new`
route is an accessible industrial/utilitarian workspace with token-first CSS,
the ten-language starter set, learner level and review mode controls, local
source metrics, validation, stable loading/processing/success/empty/error
states, bounded result polling, retry/check behavior, strict review success
envelope validation, summary/finding/learning views, severity/category
filters, line highlighting, copy, and safe Luna execution metadata. The
default route uses an explicitly labeled deterministic fixture; its API client
preserves the accepted empty-body process endpoint and result endpoint without
client provider/model overrides or secrets. Post-merge evidence is web
`25/25`, API `91/91`, contracts `5/5` (`121/121` root tests), build, lint,
typecheck, Prettier, diff-check, credential-shaped secret scan, and production
browser QA at 375px and 1440px with no horizontal overflow. Luna manager and
Kongming/Terra counsel accepted exact head `9aac007` with no P0/P1 blocker.
P2 boundaries are the demo-only transport, deferred Monaco/streaming/history/
detail/diff/download/full result sections, no live auth/AI/PostgreSQL/Redis/
queue evidence, incomplete duplication of every server-side client bound, and
no abort of an already in-flight request. This is a bounded UI checkpoint, not
a production-ready claim.

Phase 09A is accepted on local main at `4916152` after the exact Luna worker
chain `b93e3d6 -> 488a72a -> 642fe6d`, based on `80c0c8c`. The authenticated
usage read model exposes owner-scoped summary, paginated history, and UTC-day
quota routes. Summary/history exclude soft-deleted reviews and source; usage
totals are restricted to owned completed persisted results. Authenticated
quota limits are configuration-driven with defaults QUICK=20, STANDARD=10,
DEEP=3, and quota counts all owner-created review records in the UTC window,
including soft-deleted rows, to prevent deletion bypass. Post-merge evidence
is API `107/107`, web `25/25`, contracts `5/5` (`137/137` root tests), lint,
typecheck, build, Prettier, Prisma validate/generate, diff-check, and a
bounded credential-shaped scan. Luna manager and Kongming/Terra counsel found
no P0/P1 blocker. Redis enforcement, guest quotas, history search/filter,
dashboard UI, live PostgreSQL/Redis evidence, and strict snapshot/cursor
pagination remain later Phase 09 slices; this is not a complete Phase 09
claim.

Phase 09B is accepted on local main at `ffcb819` after the exact Luna worker
chain `53b805f -> 27c7fb7 -> c88c045 -> 1c362e8 -> a7d861f -> cb1cf3c ->
93e077a -> 9e6a346 -> 6695ed2`, based on `dceb935`. The web shell now links
to `/dashboard`, `/history`, and `/usage` with deterministic demo-labelled
usage surfaces, source-free responsive history, fixture-only filters, quota
rails, and explicit deferred metrics. The usage client accepts shared
optional envelope metadata strictly and keeps over-limit progress semantics
accessible without hiding actual usage. Post-merge evidence is web `32/32`,
API `107/107`, contracts `5/5` (`144/144` root tests), lint, typecheck, build,
Prettier, Prisma validate/generate, diff-check, staged credential-shaped
scans, and 375px/1440px browser QA with no overflow. Luna manager and
Kongming/Terra counsel accepted the exact head with no P0/P1 blocker. This
remains a bounded UI checkpoint: live auth/API, PostgreSQL/Redis, server
search/date/sort, backend failure simulation, and deferred cost/model/
provider/reasoning fields remain later work.

Phase 09C is accepted on local main at `8a4acc3` after the exact Luna worker
chain `97db82b -> e462686 -> f37ed79 -> 0a6aaef`, based on `1b0f82d`.
Authenticated usage history now has owner-safe language/mode/status filters,
bounded review-ID-only search, strict UTC range validation, stable
createdAt/id sorting, source-free responses, and documented Swagger query
parameters. The Prisma boundary escapes `_` so review-ID search remains a
literal substring operation under PostgreSQL LIKE/ILIKE semantics; persisted
title search is explicitly deferred because Review has no title column.
Post-merge evidence is API `112/112` across 23 suites, API lint, typecheck,
build, Prettier, Prisma validate/generate, diff-check, and a credential-shaped
scan with no matches. Luna manager and Kongming/Terra counsel accepted the
exact worker head with no P0/P1 blocker. This remains a bounded server-filter
checkpoint: no live PostgreSQL execution proof, Redis atomic enforcement,
guest quotas, live auth/API wiring, or cursor/snapshot pagination claim.

Phase 09D1 is accepted on local main at `0eda9cf` after the exact Luna worker
chain `cb4ce7f -> d50da34 -> 42b6464 -> 62d921f`, based on `41a2d63`.
The Redis primitive boundary now uses lazy validated node-redis 6.2.0 with
`isReady` gating, disabled offline queue, no reconnect, bounded unref'd
deadlines, redacted typed errors, and operation-specific quota/lock context.
Atomic Lua quota reservation covers authenticated `20/10/3` defaults, guest
QUICK `3`, UTC-day expiry, safe namespaces, and bounded result parsing. Locks
use `SET NX PX` and compare/delete release with opaque bounded tokens.
Post-merge evidence is focused Redis `17/17`, API `129/129` across 28 suites,
build/typecheck/lint/Prettier, Prisma validate/generate, diff-check, and a
credential-shaped scan with no matches. Manager Luna and Kongming/Terra
counsel accepted exact `62d921fb81836cb462cb796e4328a5a3f8ace21f` with no P0/P1.
This remains a primitives-only checkpoint: no live Redis/PostgreSQL or HTTP/
guest integration claim; timed-out commands are indeterminate and cannot be
blindly retried, identity derivation must remain server-side, lock leases need
processing/fencing alignment, and an undersized UTC TTL cap safely fails closed.

Phase 09D2 is accepted on exact `main` at `829ad06`, based on `8412b9c`, after
the coordinator cherry-picked worker commits `fe04d207` (quota admission
ledger) and `02978e02` (Redis absolute-expiry repair) as `28e0c7b` and
`53146aa`, then applied lint fix `f92491c` and formatter `829ad06`. Its additive
foundation covers the Prisma `QuotaAdmission` schema/migration, hashed
idempotency, owner/status repository behavior, and Redis admission
marker/compensation. Evidence is Prisma generate/validate with a non-secret
placeholder `DATABASE_URL`, API `tsc --noEmit`/build, ESLint, root Prettier,
compiled API `141/141` across 33 suites, focused Redis `6/6`, diff-check, and a
credential-shaped scan with no matches. An isolated worker hit EPERM during
generated output; coordinator main gates succeeded after direct binaries. The
worker used `gpt-5.6-luna` / `max`; Luna manager and Kongming/Terra counsel
accepted the exact head with no P0/P1. This is not production readiness: no
live Redis/Postgres/HTTP/guest/process-lock integration was run or claimed;
live EVAL and migration/DB isolation remain P2. Custom caller-supplied
`admissionId`/`reviewId` conflict policy and replay `retryAfter` are follow-ups.
D2A integration is no longer blocked: the coordinator accepted the bounded
authenticated integration through `0b573a2`, including the durable ledger,
fingerprint-bound finalizer, and authenticated `POST /api/v1/reviews`. The
remaining work is deployment secret/env hardening, guest/process-lock wiring,
and live dependency evidence; none is production-readiness evidence yet.

The current local main checkpoint includes the accepted web-auth contract
integration at `5ccb4cb`, review-domain integration through `b33d7d6`, truthful
README/package/GitHub About/media updates through `3b1f3b1`, Phase 09C history
filters through `8a4acc3`, and the Docker
slice through local `3d98a4d`, the Phase 06 Luna boundary at `369c958`, and
Phase 07A orchestration through `6b2dfe4`, Phase 07B persistence through
`ce6222b`, Phase 07C transport through `cede60c`, the Phase 08A review
workspace through `0c46164`, the Phase 09A usage read model through `4916152`,
plus auth hardening at `0b47a45`.
GitHub Actions run `31030844884` passed the
workflow lint, Hadolint, Dockerfile contract, Compose config, API/web image
builds, API `/health/live` smoke, and web `/` smoke. The Docker slice is
deliberately not called registry-published: the local Docker daemon is
unavailable, and Docker Hub namespace/credentials have not been supplied.
The release workflow is prepared with immutable tags, digest checks, SBOM,
provenance, and scan gates; a protected release ref and registry evidence are
still required.

The latest local `main` checkpoint is `dd03a5e`. It includes the Luna env
contract commit `eab8131`, the docs refresh `389ae48`, and the private
package/image release-boundary docs `dd03a5e`. The exact source gate at
`eab8131` passed Prisma validate/generate, contracts build, lint, typecheck,
`192/192` API tests across 38 suites, web/contracts tests, production build,
and format check. The docs/package worker separately passed formatting,
diff-check, credential-shaped/stale-claim scans, and a contracts pack dry-run;
no public package, license, tag, registry publication, deployment, or live
dependency claim was made.

The shared Redis executor seam is accepted on local `main` at `d7122db`,
cherry-picked from Luna worker commit `5d25462`. It exports one neutral
executor/config seam while preserving the quota-admission token alias, passed
the API `193/193` deterministic test gate, and was accepted by the Luna
arbiter as bounded DI plumbing. Live Redis remains a P2 runtime limitation;
the process-lock implementation and guest route are still pending.

The current coordinator checkpoint is `90d3033`. The docs/package continuation
is represented by focused commits `682cbf3` (README source/evidence refresh),
`90d3033` (release/package/image gate refresh), and package payload commits
`061c57b`, `ccc4f63`, `6d9212b`, `3e21505`, and `2d50ad8`. The package gate
verifies all six manifests remain private, redacts bounded diagnostics, and
accepts the exact 21-file contracts payload after clearing stale generated
`dist` output. Deterministic package, contracts, format, typecheck, and lint
checks pass; publication, license approval, registries, and live Docker remain
gated and unclaimed.

The process-lock range is intentionally not integrated yet. Luna worker commits
`098aa24`, `019c3b2`, and `b2378ee` implement token-checked renewal and
fail-closed cancellation, but the independent Luna arbiter returned `HOLD` for
a P1 delayed terminal-finalization race. Remediation and adversarial tests are
active in `D:\worktrees\RepoMentor-feature-review-process-lock-v3`; no process
lock acceptance claim is made until that exact-head review passes.

## Commit and validation contract

Each worker reports one task per commit using:

```text
<type>(<scope>): <imperative description>
```

Before each commit:

1. Inspect `git status`, `git diff`, and the staged file list.
2. Run a secret scan over the staged diff.
3. Run the narrowest relevant test, then lint/typecheck/build when shared
   contracts, config, or production behavior are affected.
4. Stage explicit paths only and commit the smallest coherent slice.
5. Record hash, files, commands, result, limitations, and next task.

The coordinator accepts a branch only after reviewing its diff, commit list,
test output, and report. Failed worktrees are preserved for diagnosis. No
test, lint rule, type check, or security gate may be weakened to obtain a pass.

## Acceptance traceability

| Acceptance group | Primary proof |
| --- | --- |
| Auth/session/ownership | API integration tests, cookie/token assertions, authorization tests |
| Review editor/result/history | React tests, Playwright journey, API contract tests |
| Luna safety and correctness | provider contract tests, Zod schema tests, injection fixtures |
| Persistence/usage/quota | Prisma migration/schema validation, transaction and quota tests |
| Streaming/retry/cancel | SSE lifecycle and status-transition tests |
| Security/observability | security checklist, redaction tests, health/metrics assertions |
| Operability | Docker Compose validation, image build, CI workflow syntax and local checks |
| Maintainability | README, architecture/API/security/testing/deployment docs, ADRs, focused history |

## Report and state locations

- Durable plan: `plans/20260805-repomento/plan.md` and `phase-*.md`.
- Orchestration captures: `plans/reports/orchestrate-<timestamp>/`.
- Per-task reports: `plans/reports/<phase-or-job>.md`.
- Branch/commit ledger: update this plan after every accepted branch.
- Agent/thread ledger: update this plan with resolved Luna model, reasoning,
  branch, worktree, status, and report path.

## Stop and escalation rules

Stop at a phase boundary when a product/security/architecture decision cannot
be inferred safely, when required Luna/worktree capability is unavailable, or
when the same blocker has failed three reasonable attempts. Preserve evidence
and state the smallest unblock action. Do not call the result production-ready
without live integration evidence.

## Branch and commit ledger

| Branch | Phase | Worker/thread | Commits | State |
| --- | --- | --- | --- | --- |
| `main` | 00 | coordinator | `8662b6e` | integrated |
| `main` | 01 | Luna foundation + manager arbiter | `ec28301`, `9b2b960`, `abea984`, `8072468`, `e3fa107` | integrated |
| `main` | 02 | Luna API/web/UI workers + manager arbiter + coordinator | `5234b11`, `37f9eb4`, `b311289`, `68140cd`, `1bcaf61`, `692eeef`, `32ae68b`, `3a71c6e`, `f2e19a5`, `85ed97d`, `7a4e8a0`, `fa15804`, `91e3bf7`, `9a11995`, `6178fa2`, `7c18e18` | accepted at `7c18e18`; live infra/auth/domain pending |
| `main` | 03 | Luna manager/coordinator, sequenced infra/config/database slices | `3e7499a`, `402bde0`, `dd51225`, `721d492`, `f41d92f` | checkpoint accepted at `f41d92f`; domain migration/seed deferred to Phase 04 |
| `main` | 04 | Luna contracts + ak frontend workers, coordinator | `b22d1c7`, `5c1bae6`, `c1d3d9f`, `c274f4f`, `3c4252a` | transport/UI checkpoints accepted; API/session integration pending |
| `main` | 04 | Luna auth API manager + coordinator replay | `9fdfd31`, `2469808`, `e0966f4`, `d6227c4`, `0caabf9`, `04f829d`, `79f2aa7`, `7d2ab3f`, `476bd7a`, `a9eb7f0`, `75b5a3a`, `07eb2c8`, `9413493` | API integrated; web contract reconciliation follows in `5ccb4cb`; live DB/Redis unverified |
| `main` | planning | coordinator + Kongming/Terra advisory | `1443274` | optional RAG provider boundary recorded; no secret/live provider |
| `main` | 04 | Luna web-auth integration + manager arbiter | `db6a85f`, `5e5f89f`, `5ccb4cb` | accepted; strict success envelope and 16 web tests; live browser/API unverified |
| `main` | 05 | Luna review-domain worker + manager arbiter | `2ea3732`, `a2f8761`, `272310e`, `84f5e92`, `b33d7d6` | accepted; 40 API tests and ownership/lifecycle gates; live DB unverified |
| `main` | 06 | Luna AI worker + Luna manager arbiter + Kongming/Terra counsel | `75f05aa`, `0cae58c`, `901d1fc`, `369c958` | accepted; 62 API tests including 22 AI tests; live AI and processing pipeline deferred |
| `main` | 07A | Luna processing worker + Luna manager arbiter + Kongming/Terra counsel | `aab1d48`, `6b2dfe4` (worker `b907af0`, `ddaacb4`) | accepted; 13 focused processing tests and 75 API tests; persistence, route/queue, SSE, retry transport, and live services deferred |
| `main` | 07B | Luna persistence worker + Luna manager arbiter + Kongming/Terra counsel | `ce6222b` (worker `3bddb27`) | accepted; 18 focused persistence/processing tests and 80 API tests; live DB/concurrency, route/queue, SSE, and retry transport deferred |
| `main` | 07C | Luna processing transport worker + Luna manager arbiter + Kongming/Terra counsel | `41b65a9`, `e7caccb`, `54179dd`, `cede60c` (worker `ad32a51`, `1ba9735`, `3cea836`, `65ebf48`) | accepted; 22 focused, 13 review E2E, 91 API, 112 root tests; live AI/DB/Redis/queue/SSE deferred |
| `main` | 08A | Luna ak-fe UI worker + Luna manager arbiter + Kongming/Terra counsel | `bd12761`, `6740d70`, `ec51172`, `011a516`, `0c46164` (worker `533cf73`, `c96988f`, `5eca1bf`, `9ea5afa`, `9aac007`) | accepted bounded `/reviews/new` checkpoint; 25 web, 91 API, 5 contracts, 121 root tests; demo transport and Monaco/streaming/history/live services deferred |
| `main` | 09A | Luna usage API worker + Luna manager arbiter + Kongming/Terra counsel | `ecdf10f`, `72472b2`, `4916152` (worker `b93e3d6`, `488a72a`, `642fe6d`) | accepted bounded owner-scoped summary/history/quota read model; 107 API, 25 web, 5 contracts, 137 root tests; Redis/guest quota, search/filter, dashboard, and live services deferred |
| `main` | 09B | Luna ak-fe usage UI worker + Luna manager arbiter + Kongming/Terra counsel | `4c0e26d`, `84df4f2`, `b4b6236`, `aaea4f5`, `e9cf5bc`, `4951c5b`, `b9390a5`, `9e24463`, `ffcb819` (worker `53b805f`, `27c7fb7`, `c88c045`, `1c362e8`, `a7d861f`, `cb1cf3c`, `93e077a`, `9e6a346`, `6695ed2`) | accepted bounded `/dashboard`, `/history`, `/usage` checkpoint; 32 web, 107 API, 5 contracts, 144 root tests; live auth/API and server history filters deferred |
| `main` | 09C | Luna usage-history filter worker + Luna manager arbiter + Kongming/Terra counsel | `f66bd45`, `5fba494`, `b662058`, `8a4acc3` (worker `97db82b`, `e462686`, `f37ed79`, `0a6aaef`) | accepted bounded owner-safe filters/search/UTC/sort; 112 API tests; live PostgreSQL, Redis enforcement, guest quota, and cursor/snapshot evidence deferred |
| `main` | 09D1 | Luna Redis primitive worker + Luna manager arbiter + Kongming/Terra counsel | `e2be702`, `08edbab`, `3518f76`, `0eda9cf` (worker `cb4ce7f`, `d50da34`, `42b6464`, `62d921f`) | accepted bounded Redis quota/lock primitives; 17 focused, 129 API tests; no live Redis, HTTP/guest wiring, or production-readiness claim |
| `main` | 09D2 | Luna quota-admission worker + Luna manager arbiter + Kongming/Terra counsel | `28e0c7b`, `53146aa`, `f92491c`, `829ad06` (worker `fe04d207`, `02978e02`) | accepted foundation at exact `main` `829ad06`; 141/141 compiled API across 33 suites and focused Redis 6/6; no live Redis/Postgres/HTTP/guest/process-lock or production-readiness claim |
| `docs/phase-09d2-quota-admission` | docs | coordinator | `docs(plan): record Phase 09D2 admission checkpoint` (parent `829ad06`; this commit) | docs-only update; exactly the two Phase 09D2 planning files |
| `main` | 09D2A | Luna quota-admission integration worker + Luna manager arbiter | `ea1d48d` ... `0b573a2` (worker chain `e9289e2` ... `dfe6f24`) | accepted authenticated `POST /api/v1/reviews`, fingerprint-bound finalizer and idempotent replay; 192/192 API tests across 38 suites; live PostgreSQL/Redis/HTTP, guest/process-lock, and production readiness deferred |
| `D:\worktrees\RepoMentor-quota-admission-integration` | 09D2A | Luna worker | `feature/quota-admission-integration` | accepted after focused `mode: null` remediation at `dfe6f24`; unrelated `pnpm-workspace.yaml` edit preserved and excluded |
| `main` | 09D2A-manager | Luna manager/arbiter | read-only exact-head review, thread `019fd14f-e844-7f83-988f-7a27e3639fe2` | `ACCEPT`; exact head `dfe6f24`, P0/P1 none; P2 live dependency/runtime limits recorded |
| read-only counsel | 09D2A-Kongming | Terra advisor | fresh exact-head rerun was shutdown after timeout; no edits or acceptance claim | predecessor Terra findings were used as design input; final acceptance remained Luna-owned and the `mode: null` P1 was re-arbitrated by Luna |
| `main` | auth hardening | coordinator validation follow-up | `0b47a45` | accepted; rejects non-canonical Base64URL token encodings; full API/root tests pass |
| `main` | docs/release | Faraday Luna + coordinator follow-up | `54c039f`, `d7e873c`, `2da1bd5`, `4673295`, `3b1f3b1` | accepted; README/release metadata, real UI GIF, and CI evidence; no production/public-package claim |
| `main` | 13 | Raman Luna + manager arbiter | `014c5e7`, `9456850`, `cf2e62b`, `16a81d1`, `69f83ab`, `d910080`, `10f1b71`, `6448e67`, `952bbc5`, `dc238d3`, `14f0c3e`, `3d98a4d` | accepted; CI run `31030844884` passed Docker/Compose/build/smoke gates; registry publication pending |
| `main` | 13 | Volta Luna + manager arbiter | `eab4557`, `6e90530`, `8c0f0c0`, `86a1c69`, `2cb9c9d` | accepted Compose/env/docs slice; local startup and live smoke pending |
| `main` | 13-env | Luna env-contract worker + coordinator | `eab8131` (worker `a6234bb`) | accepted required quota fingerprint secret wiring in `.env.example`, Compose, and container validation; safe config check passed; no live daemon claim |
| `main` | 13-redis-seam | Luna Redis seam worker + Luna manager arbiter | `d7122db` (worker `5d25462`) | accepted bounded neutral executor/config DI seam; API `193/193`; live Redis remains P2 and process-lock is not included |
| `main` | docs/package | Luna docs/package worker + coordinator | `389ae48`, `dd03a5e` (worker `46c324d`, `052c52e`) | accepted README/release refresh; private package boundary, license gate, GHCR/Docker Hub gates, exact evidence, and real GIF limits recorded; no publication claim |
| read-only counsel | docs/package-advisor | Terra advisor | `019fdc0a-81e8-7610-b96d-488a28e17408` | completed; reviewed stale claims, exact-head evidence, media/GitHub About boundaries; no edits or acceptance claim |
| read-only counsel | docs/package-kongming | Terra package/release counsel | `019fdc0a-82ca-7382-9a64-33a0e1082a35` | completed; confirmed private manifests, missing license/payload checker, registry gates, and package naming risks; no edits or acceptance claim |
| `main` | docs/package-refresh-v2 | Luna docs/package workers + coordinator | `682cbf3`, `90d3033`, `061c57b`, `ccc4f63`, `6d9212b`, `3e21505`, `2d50ad8` | integrated at `90d3033`; second Luna package arbiter accepted exact `00eb996`; stale-output follow-up verified on coordinator; no publication claim |
| `feature/review-process-lock-v3` | 13-process-lock | Luna process worker + independent Luna arbiter + remediation | `098aa24`, `019c3b2`, `b2378ee`; worker `019fdc64`; arbiter `019fdc73`; remediation `019fdc7c` | HOLD at `b2378ee` because delayed finalization can race lease loss; no merge/acceptance claim |
| `feature/guest-review` | 09D3-guest | Luna implementation worker | active; worker `019fdc76`; worktree `D:\worktrees\RepoMentor-feature-guest-review` | server-derived HMAC guest identity, QUICK quota, no-history route in progress; no merge/live claim |
| `feature/web-review-experience` | 08B-review-ui | Luna AK FE worker | active; worker `019fdc7e`; worktree `D:\worktrees\RepoMentor-feature-web-review-experience` | Monaco/result actions/diff boundaries in progress; no merge/live claim |
| read-only counsel | current-Kongming-audit | Luna advisor | active; thread `019fdc7e-4cd0-73e1-947e-73d8d0534dfe` | security/streaming/docs/release requirement audit in progress; no edits or acceptance claim |

## Agent/thread ledger

| Job | Role | Model/reasoning | Worktree | Status | Report |
| --- | --- | --- | --- | --- | --- |
| coordinator | merge/controller | Luna-only constraint | `D:\RepoMentor` | active | this plan |
| phase-01-foundation | implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-monorepo-foundation` | accepted | `plans/reports/orchestrate-20260805T164200/report.md` |
| phase-01-manager-arbiter | reviewer/fix | `gpt-5.6-luna` / `max` | manager worktree; merge handoff unsupported | accepted with limitation | `plans/reports/orchestrate-20260805T164200/report.md` |
| phase-02-api | implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-api-scaffold` | integrated; 3 focused commits | pending Phase 02 report |
| phase-02-web | implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-web-scaffold` | integrated; 2 focused commits | pending Phase 02 report |
| phase-02-kongming-counsel | advisory architecture | `gpt-5.6-terra` / `max` | read-only counsel thread | completed; no edits | advisory notes in coordinator log |
| phase-02-contracts | implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-transport-contracts` | accepted; 2 commits, 3 tests | `plans/reports/orchestrate-20260805T192444/report.md` |
| phase-02-ui-foundation | implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-ui-foundation` | accepted; ak-fe design + shell | `plans/reports/orchestrate-20260805T192444/report.md` |
| phase-02-ui-arbiter | manager/reviewer | `gpt-5.6-luna` / `max` | manager thread; Chrome/CDP | accepted after mobile fix | `plans/reports/orchestrate-20260805T192444/report.md` |
| phase-02-web-smoke | tester | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-web-shell-smoke` | accepted; 7 assertions | `plans/reports/orchestrate-20260805T192444/report.md` |
| phase-02-api-contracts | implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-api-contract-boundary` | accepted; shared contract consumer | `plans/reports/orchestrate-20260805T192444/report.md` |
| phase-02-api-boundary | manager/implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-api-error-boundary` | accepted; 5 tests, arbiter pass | `plans/reports/orchestrate-20260805T192444/report.md` |
| phase-03-infrastructure | sequenced implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-local-infrastructure`, `D:\worktrees\RepoMentor-validated-config`, `D:\worktrees\RepoMentor-prisma-tooling` | checkpoint integrated; Docker runtime unavailable | `plans/reports/orchestrate-20260805T202044/report.md` |
| phase-03-manager-arbiter | reviewer/implementer | `gpt-5.6-luna` / `max` | manager thread and sequenced worktrees | accepted exact-head gates; no live service claim | `plans/reports/orchestrate-20260805T202044/report.md` |
| phase-04-contracts | implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-auth-contracts` | accepted; commit `6dd2195`, 5 contract tests | Phase 04 report pending |
| phase-04-web-auth | ak frontend implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-feature-web-auth` | accepted; commits through `1e75bde`, 13 web tests | Phase 04 report pending |
| phase-04-api-worker | implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-auth-api` | errored at usage limit after partial commits; worktree preserved | takeover by Phase 04 manager in progress |
| phase-04-api-manager | reviewer/implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-auth-api` | active takeover; no acceptance yet | manager thread `019fd14f-e844-7f83-988f-7a27e3639fe2` |
| phase-04-api-manager | reviewer/implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-auth-api` | accepted locally; integrated at `9413493` with live DB concern | manager thread `019fd14f-e844-7f83-988f-7a27e3639fe2` |
| phase-04-web-auth-contract-integration | ak frontend implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-web-auth-contract-integration` | accepted; worker `019fd27a-cb59-7731-9ec6-425b7a18eac8`; merged through `5ccb4cb` | manager arbiter pass; visual/live limits recorded |
| phase-05-review-domain | review API/database implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-review-domain` | accepted; worker `019fd27e-5344-70f2-bcef-a2909bb895f0`; merged through `b33d7d6` | manager arbiter pass; live migration DB unavailable |
| phase-06-ai-boundary | implementer | `gpt-5.6-luna` / `max` | `feature/ai-provider-boundary` in coordinator checkout (tool limitation recorded) | accepted; worker `019fd304-b781-7aa3-8ef4-bfa09ea67383`; merged through `369c958` | 4 focused commits; no live provider call |
| phase-06-manager-arbiter | reviewer/arbiter | `gpt-5.6-luna` / `max` | read-only exact-head review | accepted; manager `019fd14f-e844-7f83-988f-7a27e3639fe2` | P1 fixes verified; safe to cherry-pick |
| phase-06-kongming-counsel | security advisor | `gpt-5.6-terra` / `max` | read-only counsel | accepted; counsel `019fd4b0-e28f-7361-b7c6-b9752bd24428` | no P0/P1 blockers; P2 hardening remains non-blocking |
| phase-06-deepseek-advisor | advisory architecture/security | `gpt-5.6-terra` / `max` | read-only counsel | completed; no edits; DeepSeek deferred behind ADR | advisory delivered to coordinator/manager |
| phase-07-review-processing | implementer | `gpt-5.6-luna` / `max` | `C:\Users\Admin\.codex\worktrees\5c8b\RepoMentor` (`feature/review-processing`) | accepted; worker `019fd4d0-61e8-7bb0-abdc-ce607e87a687`; merged as `aab1d48`, `6b2dfe4` | 13 focused processing tests; no persistence/route/SSE/live-service claim |
| phase-07-manager-arbiter | reviewer/arbiter | `gpt-5.6-luna` / `max` | read-only exact-head review | accepted; manager `019fd14f-e844-7f83-988f-7a27e3639fe2` | exact chain accepted; P1 race fixes verified |
| phase-07-kongming-counsel | security/architecture advisor | `gpt-5.6-terra` / `max` | read-only counsel | accepted; counsel `019fd4b0-e28f-7361-b7c6-b9752bd24428` | no P0/P1 blockers; persistence CAS/lease and outbox remain later slices |
| phase-07-review-persistence | implementer | `gpt-5.6-luna` / `max` | `C:\Users\Admin\.codex\worktrees\a71e\RepoMentor` (`feature/review-persistence`) | accepted; worker `019fd4f8-8967-7c00-809c-eb95623c3976`; merged as `ce6222b` from `3bddb27` | 18 focused tests, 80 API tests; no live DB/Redis/AI or transport claim |
| phase-07-persistence-manager | reviewer/arbiter | `gpt-5.6-luna` / `max` | read-only exact-head review | accepted; manager `019fd14f-e844-7f83-988f-7a27e3639fe2` | P0/P1 none; P2 database invariant and live Postgres evidence deferred |
| phase-07-persistence-kongming-counsel | security/architecture advisor | `gpt-5.6-terra` / `max` | read-only counsel | accepted; counsel `019fd4b0-e28f-7361-b7c6-b9752bd24428` | no P0/P1 blockers; claim fencing and DB trigger/constraint follow-ups recorded |
| phase-07-processing-transport | implementer | `gpt-5.6-luna` / `max` | `C:\Users\Admin\.codex\worktrees\492d\RepoMentor` (`feature/review-processing-command`) | accepted; worker `019fd51a-5bc9-7452-a53b-31c0271f416d`; merged as `41b65a9`, `e7caccb`, `54179dd`, `cede60c` | 22 focused, 13 review E2E, 91 API, 112 root; no live-service claim |
| phase-07-processing-manager | reviewer/arbiter | `gpt-5.6-luna` / `max` | read-only exact-head review | accepted; manager `019fd14f-e844-7f83-988f-7a27e3639fe2` | P0/P1 none after generation fence and 504/503/429 mapping fixes; P2 live/runtime limits recorded |
| phase-07-processing-kongming-counsel | security/architecture advisor | `gpt-5.6-terra` / `max` | read-only counsel | accepted; counsel `019fd4b0-e28f-7361-b7c6-b9752bd24428` | P0/P1 none; disconnect/deadline/quota and live integration remain follow-ups |
| phase-08-review-ui | ak frontend implementer | `gpt-5.6-luna` / `max` | `C:\Users\Admin\.codex\worktrees\26dc\RepoMentor` (`feature/review-ui`) | accepted; worker `019fd568-0197-7110-acff-cac1d2139e68`; integrated through `0c46164` | 25 web tests; production browser QA 375px/1440px; demo transport and later UI surfaces deferred |
| phase-08-ui-manager | reviewer/arbiter | `gpt-5.6-luna` / `max` | read-only exact-head review | accepted; manager `019fd14f-e844-7f83-988f-7a27e3639fe2` | P1 metadata validation fixed at `9aac007`; no P0/P1 blockers; integration P2 limits recorded |
| phase-08-ui-kongming-counsel | security/architecture advisor | `gpt-5.6-terra` / `max` | read-only counsel | accepted; counsel `019fd4b0-e28f-7361-b7c6-b9752bd24428` | no P0/P1 blockers; scan regex was test-only; live auth/backend and deeper client bounds deferred |
| phase-09-usage-api | implementer | `gpt-5.6-luna` / `max` | `C:\Users\Admin\.codex\worktrees\d3b5\RepoMentor` (`feature/usage-summary-api`) | accepted; worker `019fd5aa-cf1f-7c80-ab25-b87e566f39b4`; integrated through `4916152` | 107 API tests; owner-scoped read model and config-driven UTC quota; pnpm lifecycle wrapper limitation recorded; Redis/guest quota/filter/dashboard/live services deferred |
| phase-09-usage-manager | reviewer/arbiter | `gpt-5.6-luna` / `max` | read-only exact-head review | accepted; manager `019fd14f-e844-7f83-988f-7a27e3639fe2` | exact `642fe6d` accepted with no P0/P1; P2 Swagger bearer scheme, live services, snapshot consistency, cursor pagination |
| phase-09-usage-kongming-counsel | security/architecture advisor | `gpt-5.6-terra` / `max` | read-only counsel | accepted; counsel `019fd4b0-e28f-7361-b7c6-b9752bd24428` | no P0/P1; owner isolation/UTC/config boundaries pass; Redis/guest quota/filter/dashboard/live checks deferred |
| phase-09-usage-ui | ak frontend implementer | `gpt-5.6-luna` / `max` | `C:\Users\Admin\.codex\worktrees\31df\RepoMentor` (`feature/history-usage-ui`) | accepted; worker `019fd5d3-3367-7d71-9841-4913a95df82a`; integrated through `ffcb819` | 32 web tests; dashboard/history/usage surfaces, fixture/API boundary, 375px/1440px browser QA; live auth/API and server filters deferred |
| phase-09-usage-ui-manager | reviewer/arbiter | `gpt-5.6-luna` / `max` | read-only exact-head review | accepted; manager `019fd14f-e844-7f83-988f-7a27e3639fe2` | initial HOLD fixed by `6695ed2`; exact `6695ed2` accepted with no P0/P1; P2 live auth bridge and validator hardening |
| phase-09-usage-ui-kongming-counsel | security/architecture advisor | `gpt-5.6-terra` / `max` | read-only counsel | accepted; counsel `019fd4b0-e28f-7361-b7c6-b9752bd24428` | no P0/P1 after remediation; demo honesty/source-free/a11y pass; live auth/API and server filters deferred |
| phase-09-history-filters | implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-history-filter` (`feature/history-filter-api-disk`) | accepted; worker `019fd614-d769-74b0-a1c0-2beaa8d935e0`; integrated through `8a4acc3` | 4 focused commits; 21 focused and 112 post-merge API tests; live PostgreSQL and high-volume pagination remain P2 |
| phase-09-history-filters-manager | reviewer/arbiter | `gpt-5.6-luna` / `max` | read-only exact-head review | accepted; manager `019fd14f-e844-7f83-988f-7a27e3639fe2` | exact `0a6aaef` accepted; no P0/P1; live PostgreSQL evidence remains P2 |
| phase-09-history-filters-kongming-counsel | security/architecture advisor | `gpt-5.6-terra` / `max` | read-only exact-head counsel | accepted; counsel `019fd4b0-e28f-7361-b7c6-b9752bd24428` | `_` wildcard remediation accepted; no P0/P1; live PostgreSQL and scale profiling remain P2 |
| phase-09-redis-primitives | implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-usage-redis` (`feature/usage-redis-enforcement`) | accepted; worker exact `62d921f`; 4 focused commits, 17 focused and 129 API tests; no live Redis claim | `plans/reports/phase-09-redis-primitives.md` (suggested, not created) |
| phase-09-redis-primitives-manager | reviewer/arbiter | `gpt-5.6-luna` / `max` | read-only exact-head review | accepted after remediation; exact `62d921f`; no P0/P1; live Redis/HTTP deferred | manager thread `019fd14f-e844-7f83-988f-7a27e3639fe2` |
| phase-09-redis-primitives-kongming-counsel | security/architecture advisor | `gpt-5.6-terra` / `max` | read-only exact-head counsel | accepted after fail-fast remediation; no P0/P1; live Redis and integration risks remain P2 | counsel thread `019fd4b0-e28f-7361-b7c6-b9752bd24428` |
| phase-09d2-quota-admission | implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-quota-admission` (`feature/quota-admission-ledger`) | accepted; worker `fe04d207`, `02978e02`; unrelated worker-local `pnpm-workspace.yaml` edit preserved | additive QuotaAdmission foundation; no live integration claim; D2A was later accepted as a separate integration slice |
| phase-09d2-manager | reviewer/arbiter | `gpt-5.6-luna` / `max` | read-only exact-head review | accepted; exact `main` `829ad06`; no P0/P1; manager thread `019fd14f-e844-7f83-988f-7a27e3639fe2` | live EVAL, migration/DB isolation, and integration wiring remain P2/follow-up |
| phase-09d2-kongming-counsel | security/architecture advisor | `gpt-5.6-terra` / `max` | read-only exact-head counsel | accepted; exact `main` `829ad06`; no P0/P1; counsel thread `019fd4b0-e28f-7361-b7c6-b9752bd24428` | durable-ledger requirement was addressed by the later D2A integration; conflict/replay semantics remain follow-ups |
| phase-13-docs-release-media | documentation/media implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-docs-release-media` | accepted; worker `019fd2ac-2034-7752-83ef-e2d7cefda10e`; merged through `4673295` | Faraday report; real 3-frame UI GIF |
| phase-13-docker-release | Docker/CI implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-docker-release` | accepted; worker `019fd2b1-daad-7302-824c-adef31c220ff`; merged through `3d98a4d` | Raman report; CI `31030844884` green; live registry pending |
| phase-13-docker-compose-runtime | Compose/env/docs implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-docker-compose-runtime` | accepted; worker `019fd2d1-eb9d-7fd0-ab68-4f5f2b44073f`; merged through `2cb9c9d` | Volta report; Docker daemon/live startup unavailable |
| phase-13-container-advisor | supply-chain advisor | `gpt-5.6-terra` / `max` | read-only counsel | completed; worker `019fd2b2-1664-7780-9d71-72f8b7f4582c`; no edits | hold findings resolved statically; live publish still gated |
| phase-13-env-contract | implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-quota-admission-env` | accepted; worker `019fdbfc-455d-7f21-ab09-b69858391aa7`, commit `a6234bb`, merged as `eab8131` | required fingerprint-secret env/Compose/validation wiring; safe config check passed; no live daemon claim |
| phase-13-redis-seam | implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-review-process-lock-v2` | accepted; worker `019fdc26-028b-7941-91a6-20e8951f51c7`, commit `5d25462`, merged as `d7122db` | neutral shared executor/config seam; API `193/193`; no live Redis claim |
| phase-13-process-lock | implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-review-process-lock-v2` | pending; workers `019fdc21`, `019fdc2f`, `019fdc32` shut down without diffs | implementation held to Luna-only rule; no process-lock acceptance or claim |
| phase-13-process-lock-advisor | security/architecture advisor | `gpt-5.6-terra` / `max` | read-only counsel | completed; worker `019fdc1c-e2a0-7ea0-afa8-614e30735330`; no edits | lock-before-claim, fail-closed Redis, finally release, 503/409, and guest boundaries advised; advisory only |
| phase-13-docs-package | documentation/package implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-docs-package` | accepted; worker `019fdc0c-2d58-73f1-bd28-e03746ccf90d`; merged as `389ae48`, `dd03a5e` | README/release refresh; private package boundary and exact release gates; no metadata/publication claim |
| phase-13-docs-package-advisor | documentation/security advisor | `gpt-5.6-terra` / `max` | read-only counsel | completed; worker `019fdc0a-81e8-7610-b96d-488a28e17408`; no edits | stale-claim, exact-head, media, and GitHub About review; advisory only |
| phase-13-docs-package-kongming | package/release advisor | `gpt-5.6-terra` / `max` | read-only counsel | completed; worker `019fdc0a-82ca-7382-9a64-33a0e1082a35`; no edits | private manifests, license/payload, registry naming, and release-gate review; advisory only |

## Unresolved questions

- External OpenAI/PostgreSQL/Redis credentials and deployment targets are not
  present; local deterministic tests proceed, live checks remain explicit.
- Package versions and API details must be resolved from the installed runtime
  and current official documentation at the implementation point.
- Phase 02 checks prove the application/UI foundation and transport boundary;
  readiness is still application-only, Swagger production exposure remains a
  hardening follow-up, and full browser E2E begins in the later quality phase.
- Phase 09D2A authenticated admission integration is accepted as a bounded
  checkpoint at `0b573a2`; exact source/env/docs checkpoint is now `dd03a5e`;
  it is not production readiness. Live Redis EVAL,
  PostgreSQL migration/transaction isolation, HTTP process, guest quota,
  process-lock, external Luna, registry, and deployment evidence remain
  deferred. Custom caller-supplied `admissionId`/`reviewId` conflict policy
  and replay `retryAfter` remain follow-ups.
- The shared Redis executor/config seam is accepted at `d7122db` as bounded DI
  plumbing. Process-lock renewal and guest no-history integration are active
  follow-ups. The first process-lock range is held by an independent Luna P1
  finding about delayed terminal finalization; remediation must pass before
  merge. Guest identity/quota and live Redis/HTTP evidence remain deferred.

## Continuation checkpoint — 2026-08-07 (Luna-only)

The coordinator checkpoint is `main` at `c84b76b` (clean, 21 commits ahead of
`origin/main`). The accepted local continuation now includes the package
payload/release guard, guest QUICK review, Redis process-lock renewal and
generation fence, fence-error remediation, and the AK FE review experience:

- guest chain: `a7e1f8a`, `a218b9c`, `679edbd`, `681bd12`;
- process-lock chain: `0c26cef`, `fef1eeb`, `b878d45`, `9f710cf`, `ec28a99`;
- web review chain: `e313157`, `14c8eeb`, `5dfb7c7`, `c84b76b`.

Post-merge evidence on this exact main is API `229/229` across 44 suites, web
`37/37`, contracts `5/5`, full workspace tests, typecheck, lint, production
build, Prettier, package payload `21/21`, diff-check, and a credential-shaped
scan with no matches. These are deterministic/fake or local-build gates; live
PostgreSQL, Redis, Luna, Docker, registry publication, and multi-instance
runtime evidence remain unclaimed.

Branch hygiene is frozen under AK review: branch names do not authorize a
merge, and no dirty worktree is eligible. The branch triage found 41 refs not
merged into `main` and 7 dirty worktrees. Only
`feature/review-stream-lifecycle` is the active missing-scope branch; old
process/auth/history/usage branches are preserved and require exact residual
diff review before any action. No worktree, editor/Codex data, AGENTS file, or
unrelated dirty change may be deleted or swept into a commit.

The active stream slice is additive and must freeze the following before
merge: durable transaction-coupled per-review event sequence, exclusive
`Last-Event-ID` replay, raw status-only SSE without source/result/provider
data, fetch-based bearer-auth streaming, polling fallback, explicit cancel
only, duplicate process idempotency, retry/cancel race fencing, owner
isolation, bounded heartbeat/lifetime, and honest live-integration limits.
Kongming's current decision is HOLD until those exact-head implementation and
race tests exist; an independent Luna arbiter must review the final branch.

## Continuation resolution — 2026-08-07

The stream slice completed its bounded scope and was integrated into `main`.
The coordinator preserved the focused commit chain from the exact worker head
`3e1139d` and cherry-picked it through final main `615533d`:

- lifecycle contract and retryable snapshot fixes: `e5aefcb`, `70cbf64`;
- transaction-coupled Prisma/in-memory lifecycle events: `b303efc`;
- authenticated raw SSE, replay/reset, heartbeat/lifetime, run coalescing,
  cancel/retry wiring, and web fetch transport: `2035e11`, `1f56d60`,
  `579c936`;
- package payload allowlist for `review`: `13f769f`;
- per-review Redis stream lease, active-session revalidation during polling,
  opaque local fallback tokens, and command-input tests: `c420866`,
  `dfccc86`, `615533d`.

The stream acceptance checklist is now covered by code and deterministic
tests: durable monotonic IDs are transaction-coupled to status transitions;
`Last-Event-ID` replay is exclusive with bounded reset; SSE frames are raw,
status-only, and source/result/provider/credential-free; the browser uses
authenticated fetch streaming without query credentials and retains bounded
polling fallback; disconnect does not cancel processing; explicit cancel,
retry-generation fencing, owner isolation, duplicate-run coalescing, session
revocation revalidation, and a distributed per-review stream lease are
covered. Post-merge evidence is API `245/245`, web `38/38`, contracts `6/6`,
full workspace tests, typecheck, lint, production build, Prettier, Prisma
validate/generate, package payload `25` exact files, diff-check, and a clean
credential-shaped scan.

The independent arbiter tool was attempted three times on the final exact
head but each run remained active without a conclusion and was shut down; it
must not be represented as an ACCEPT. The coordinator performed the exact
head/base/scope/status/validation review against Kongming's memo and found no
remaining P0/P1 in this bounded slice. Live PostgreSQL, Redis, Luna, Docker,
multi-instance runtime, browser interaction E2E, and registry publication
remain unverified. These limits block production-readiness claims but do not
block this local merge.

Branch discipline resolution: `feature/review-stream-lifecycle` is complete,
clean, and merged. It is no longer an active work item. Historical dirty
branches/worktrees remain frozen inventory and are not eligible for wholesale
merge or deletion; each must receive an exact residual-diff decision before
any future action. Next active scope is security hardening/observability and
release evidence, each in one bounded branch that must finish clean and merge
before the next branch is started.

## Security hardening resolution — 2026-08-07

The next bounded branch was `fix/security-http-hardening`, based exactly on
`main` `83b2bc0`. Its scope was limited to the production HTTP boundary:
disable Swagger UI/document exposure in production while preserving the
development/test surface, add baseline response security headers, cover both
behaviors deterministically, and document the boundary. The Luna worker did
not return within the bounded review window, so the coordinator completed the
same scope locally without widening it.

The branch finished clean and was integrated immediately as two focused
commits:

- `dfac4aa` / main `f53947e`: production Swagger gate and response security
  headers with bootstrap coverage;
- `ccd69cf` / main `ed19a09`: production HTTP boundary documentation.

Exact-head review confirmed base `83b2bc0`, four intended files, two commits,
no residual diff, and no cherry-pick duplicates before merge. API focused and
post-merge workspace evidence is `246/246` tests with zero failures; typecheck,
lint, build, format check, Prisma validation, package check, diff check, and
credential-shaped scan all pass on `main` `ed19a09`. The independent Luna
Kongming/advisor reviewer timed out and was shut down; this is recorded as no
independent ACCEPT, not as review evidence. Live browser, PostgreSQL, Redis,
Docker, registry, and deployment evidence remain unverified.

The active branch is now closed. The next scope must be selected only after
this clean merged checkpoint; historical refs and worktrees remain frozen and
must not be swept into the next change.

## Observability metrics resolution — 2026-08-07

The next bounded branch was `feature/observability-metrics`, based exactly on
main `f76a234`. Its scope was limited to an aggregate application metrics
seam: strict shared contract, process-local request totals/in-flight and
status buckets, `/health/metrics` under the existing health boundary, privacy
tests, and concise API/root documentation. No route labels, source code,
review results, provider/model data, request headers, credentials, or
PostgreSQL/Redis/Luna telemetry were added.

The Luna implementation worker did not return a diff in the bounded window,
so the coordinator took over the same branch without widening scope. The
branch finished clean and was integrated as three focused commits:

- `4398ab2` / main `e53e1a3`: metrics contract, middleware, service, endpoint,
  and deterministic API/contract tests;
- `23247e9` / main `4eec649`: API and root documentation;
- `761650e` / main `d0ae69d`: bound counters to `Number.MAX_SAFE_INTEGER` in
  both the runtime contract and its test.

Exact-head review confirmed base `f76a234`, three commits, the intended
observability files only, a clean branch, and patch-equivalence before
integration. The first merged-main test attempt exposed stale generated
`@repomentor/contracts` output after cherry-pick; rebuilding that workspace
artifact resolved it, and the final merged-main evidence is API `249/249`,
web `38/38`, contracts `7/7`, plus typecheck, lint, build, format check,
Prisma validation, package check, diff check, and credential-shaped scan.
The independent Luna Kongming/advisor reviewer timed out and was shut down;
that is recorded as no independent ACCEPT. Live PostgreSQL, Redis, Luna,
Docker, registry, browser interaction E2E, and multi-instance metrics remain
unverified.

The branch is complete and no longer active. The next bounded scope is the
Phase 12 quality pass; historical refs/worktrees remain frozen and are not
eligible for wholesale merge or deletion.

## API journey quality resolution — 2026-08-07

The next Phase 12 slice was `test/api-review-journey`, based exactly on main
`d416db9`. It added one deterministic API journey test only: registration,
login, authenticated review admission, fake-Luna processing, persisted result
read, owner review-list history, refresh-cookie logout, and access-token
revocation. The test asserts source-free boundaries and uses the existing
in-memory repositories/fake provider; it does not claim live database,
Redis, Luna, browser, or deployment coverage.

The branch finished clean and was integrated immediately as focused commit
`37d089d` / main `9359a56`. Exact-head review confirmed one changed test file,
no runtime changes, clean status, and no cherry-pick duplicate. Final
merged-main evidence is API `250/250`, web `38/38`, contracts `7/7`, plus
typecheck, lint, build, format check, Prisma validation, package check, diff
check, and credential-shaped scan. This closes the bounded API journey slice;
browser Playwright E2E, live services, and registry/deployment evidence remain
separate follow-ups.

The branch is complete and no longer active. Do not start another branch until
the next scope is explicitly bounded; preserve historical worktrees and
unmerged refs as frozen inventory.

## Web authenticated review resolution — 2026-08-07

The next bounded web slice was `feature/web-live-review`, based exactly on
main `67e0ae6`. Its scope was limited to the authenticated browser handoff:
memory-only access-token state, one-shot refresh-cookie restoration, a strict
`POST /api/v1/reviews` admission transport with a bounded `Idempotency-Key`,
accepted-field-only request serialization, server-owned review ID propagation
through process/SSE/result, and truthful API/demo UI labels. Browser storage,
provider selection, source persistence, and the deferred optional RAG path
remain outside this slice.

The Luna worker returned within the bounded window without editing the branch,
so the coordinator completed the same frozen scope locally. The branch
finished clean and was fast-forward integrated as two focused commits:

- `6c06329`: memory-only auth session, refresh-cookie seam, and truthful
  post-login workspace handoff;
- `3126647`: authenticated review admission/lifecycle transport, review ID
  wiring, transport-state UI, and deterministic web coverage.

Exact-head review confirmed base `67e0ae6`, two intended commits, no residual
diff, and no cherry-pick duplicate before integration. Merged-main evidence on
`3126647` is API `250/250`, web `40/40`, contracts `7/7`, full workspace
tests, typecheck, lint, production build, Prettier, Prisma schema validation
with a process-local dummy URL, package payload check, diff-check, and a
credential-shaped scan with no matches. The Luna read-only advisor/Kongming
reviewer timed out and was shut down without a verdict; this is recorded as
no independent ACCEPT, not as review evidence.

The implementation still lacks live browser Playwright coverage, live
PostgreSQL/Redis/Luna execution, multi-instance runtime evidence, Docker
daemon/registry publication, and deployment evidence. These remain explicit
follow-up limits and do not become production-readiness claims from local
tests alone. The branch is complete and no longer active; historical refs and
worktrees remain frozen and are not eligible for wholesale cleanup.

## Phase 12 browser journey resolution — 2026-08-08

The next bounded quality slice was `test/playwright-review-journey`, based
exactly on main `8547dc1`. Its scope was deterministic browser coverage for
the currently connected path: register, sign in, preserve the memory-only
session, open the authenticated review workspace, admit a review with strict
body and bearer assertions, consume a status-only SSE response, retrieve a
validated result, and verify that result UI does not expose provider-secret
material. The browser mocks are explicitly test-only; no live API, database,
Redis, Luna, Docker, or registry behavior is substituted into the claim.

The Luna implementation worker timed out without a diff, so the coordinator
implemented the same frozen scope locally. The branch finished with two
focused commits and was fast-forward integrated:

- `40ef5e2`: make result-boundary UI truthful for API, custom, and demo
  transports and cover the rendered API label;
- `f4b5b51`: add Playwright 1.51.1, web-server config, and the deterministic
  authenticated browser journey with strict request/envelope assertions.

Exact-head review confirmed base `8547dc1`, two intended commits, no tracked
residual diff, and no cherry-pick duplicate before merge. Merged-main evidence
on `f4b5b51` is API `250/250`, web `40/40`, contracts `7/7`, full workspace
tests, typecheck, lint, production build, Prettier, Prisma schema validation
with a process-local dummy URL, package payload check, diff-check, and a
credential-shaped scan with no matches. Playwright discovery is `1/1`.

The browser test itself was attempted but could not launch because local
Playwright 1.51.1 requested Chromium revision `chromium-1161`, which is not
installed. Browser installation was not forced; therefore this is a test
asset-availability limitation, not an E2E pass. The current journey also
does not claim history/logout UI coverage because those browser seams remain
unconnected. The Luna read-only advisor/Kongming reviewer timed out and was
shut down without a verdict; this is recorded as no independent ACCEPT. The
branch is complete and no longer active; historical refs/worktrees remain
frozen and protected generated `AGENTS.md`/`CLAUDE.md` files are preserved.

## Web live usage resolution — 2026-08-08

The next bounded web slice was `feature/web-live-usage`, based exactly on
main `245da5f`. Its scope was limited to connecting the existing memory-only
auth session to the usage read model: the API transport now accepts an
optional access-token getter and emits a Bearer header only when a current
non-empty token exists; dashboard, history, and usage overview select that
transport for authenticated sessions and retain deterministic fixtures for
guests. The existing API page/limit-only history boundary, source-free rows,
strict envelopes, and demo-only client filters remain unchanged.

The branch finished clean and was fast-forward integrated as two focused
commits:

- `c18b30c`: authenticated usage API transport and shared stable transport
  selection hook;
- `b827991`: runtime/static coverage for header presence, header absence,
  memory-only selection, and the guest/API UI boundary.

Exact-head review confirmed base `245da5f`, the intended seven-file scope,
two focused commits, clean status, valid ancestry, and no diff-check errors.
The independent Luna Kongminh/advisor reviewer timed out and was shut down
without a verdict; this is recorded as no independent ACCEPT, not as review
evidence. Merged-main evidence on `b827991` is API `250/250`, web `40/40`,
contracts `7/7`, plus typecheck, lint, production build, format check,
package payload verification, and a credential-shaped scan with no real
secret matches. Live PostgreSQL, Redis, Luna, browser interaction, Docker,
registry, and deployment evidence remain unverified.

The branch is complete and no longer active; historical refs and worktrees
remain frozen and are not eligible for wholesale cleanup. The next bounded
scope must be selected only after this clean pushed checkpoint.

## Auth, review metadata, and branch hygiene follow-up — 2026-08-08

The coordinator audited every local branch and registered worktree with exact
`git cherry main <branch>`, clean/dirty status, and explicit worktree paths.
Completed equivalent refs were removed in bounded batches; generated residue
was preserved when non-force removal could not delete non-empty directories.
The pushed `main` head is `d955eaf` and the main worktree is clean.

The auth password-change slice was implemented on exact base `6a5c5d9` as
`0813d54` and fast-forward merged/pushed. It adds `PATCH /api/v1/auth/password`,
strict DTO validation, Argon2id compare-and-update, all-session revocation
inside the Prisma transaction, refresh-cookie clearing, and deterministic
API/Prisma/controller coverage.

The review metadata slice was implemented on exact base `6a5c5d9` as
`d76c53e`, cherry-picked onto current main as `d955eaf`, and pushed. It
propagates bounded `title`, `context`, and `learnerLevel` through review
admission, version-2 keyed fingerprints, Prisma/in-memory persistence,
finalization, processing, bounded Luna prompt framing, and web transport.

Post-merge evidence at `d955eaf`: root `pnpm test` passes API `261/261`, web
`43/43`, and contracts `7/7`; typecheck, lint, build, format check, Prisma
validate/generate, diff-check, and credential scan pass. Prisma client
generation was rerun after the metadata cherry-pick because stale ignored
generated types initially exposed the integration gap. No live PostgreSQL,
Redis, Luna, browser, Docker, registry, package, or deployment evidence is
claimed.

The only remaining non-main refs are intentionally protected: clean but stale
unique `feature/auth-api`, dirty `feature/history-filter-api`, and dirty
`feature/review-process-lock-v2`. They are not eligible for deletion or merge
without a focused handoff and validation. One detached historical worktree
remains without a branch ref. Current Luna-only advisor/Kongminh attempts for
the new slices timed out and were closed; timeout is recorded as no ACCEPT.

## Education result and final exact-head audit — 2026-08-08

The education-result follow-up was delivered as two isolated Luna-only slices
and integrated immediately into `main`. The exact merged implementation/code
head is `a5f55c6`; documentation-only commits follow it on `main`. The slice
is an application checkpoint, not a production or release certification.

The contract chain was committed as focused units:

- `a751eb5`: bounded education result contract and strict schema fields;
- `6213bfb`: AI schema-boundary tests;
- `4385bc6`: web education transport validation;
- `1e6cddc`: malformed/incomplete result-envelope tests;
- `c52f792`: formatting/contract guard cleanup.

The UI chain was then committed and merged from an exact `c52f792` base:

- `a875ef5`: education result views for improved source, tests, questions,
  and diff;
- `7aa4f5c`: Markdown/JSON export support for the education artifacts;
- `a5f55c6`: deterministic result-journey coverage.

The result payload is bounded and strict. Legacy persisted results normalize to
empty education fields; new Luna results carry improved source, unified diff,
generated tests, and learning questions. The web surface treats all model
output as text/code data, provides explicit unavailable states and
copy/download actions, and never executes generated code or tests.

Exact-head validation after merge:

- `pnpm test`: API `251/251`, web `42/42`, contracts `7/7`;
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm format:check`: pass;
- `pnpm package:check`: pass with the exact allowlisted payload;
- `pnpm db:validate` and `pnpm db:generate`: pass with a process-local dummy
  `DATABASE_URL`; no database connection was claimed;
- credential-shaped repository scan: no matches;
- GitHub Container Validation run `31234347927`: success at the exact
  `a5f55c6` head, including workflow/Dockerfile/Compose validation and both
  `linux/amd64` no-publish image builds.

The guest QUICK endpoint, Redis process lease/fencing, authenticated
status-only SSE/replay with polling fallback, cancellation, logout, history,
usage, and quota boundaries are present in the merged code and covered by
deterministic tests. They do not establish live PostgreSQL, Redis/EVAL,
multi-instance, HTTP-provider, external Luna, Docker-daemon, or deployment
evidence. Playwright discovery is `1/1`; the browser journey was not claimed as
passing because Chromium revision `chromium-1161` is unavailable locally.

AK supervision remained Luna-only for current work. The bounded advisor and
Kongminh exact-head review attempts are recorded as independent evidence only
when they return a directly inspectable verdict; a timeout or shutdown is
recorded as no ACCEPT. Historical Terra counsel rows are archival context and
are not a new model exception.

The two current feature branches were pushed, fast-forward merged, and their
local/remote branch refs were deleted after exact-head checks. Their generated
dependency residue could not be removed safely after worktree unregistering,
so it was preserved. Older branches and worktrees remain frozen inventory;
none were swept, force-deleted, rebased, or mixed into the current commits.

The plan remains `in-progress` because live dependency startup, browser
execution, release credentials, registry publication, semantic tagging,
package publication, deployment, and the owner’s license decision are still
open gates. The final report maps each master-prompt acceptance criterion to
direct evidence or an explicit limitation.

## Web review cancellation resolution — 2026-08-08

The next bounded web quality slice was `feature/web-review-cancel`, based
exactly on main `e303c18`. Its scope closed the server-cancellation gap behind
the existing `Cancel run` action: the authenticated web transport now calls
`POST /api/v1/reviews/:id/cancel`, validates the source-free summary with a
strict `CANCELLED` status, and sends only credentials plus the memory-only
Bearer token. The review hook keeps one cancellation handle for the active
server run and calls it when the run is reset, superseded, or unmounted; the
deterministic demo transport remains local and unchanged. A malformed or
non-terminal success payload is rejected instead of being treated as a
successful cancellation.

The branch finished clean and was fast-forward integrated as three focused
commits:

- `4a21adf`: expose the typed authenticated cancellation transport;
- `d331e1d`: cancel active server runs from the workspace lifecycle;
- `4b2dfb7`: cover the endpoint, credential, source-free, and strict-status
  boundary in the web runtime/static suite.

Exact-head review confirmed base `e303c18`, exactly three unique commits,
four intended files, clean status, valid ancestry, no diff-check errors, and
no cherry-pick duplicate before merge. Merged-main evidence on `4b2dfb7` is
API `250/250`, web `42/42`, contracts `7/7`, root typecheck, lint, production
build, format check, package payload verification, and Prisma client
generation with a process-local configuration. The bounded Luna
advisor/Kongminh read-only audit timed out and was closed without a verdict;
this is recorded as no independent ACCEPT, not as review evidence.

No live PostgreSQL, Redis, Luna, browser, Docker daemon, registry, tag,
package publication, GitHub release, or deployment evidence was created.
Playwright discovery remains `1/1`, while the local Chromium revision is
unavailable. The branch and its newly created worktree are no longer active;
historical refs and worktrees remain frozen and protected generated
`AGENTS.md`/`CLAUDE.md` files are preserved.

## Web logout resolution — 2026-08-08

The next bounded auth slice was `feature/web-auth-logout`, based exactly on
main `0d2223f`. Its scope was limited to closing the missing web logout
boundary: strict `POST /api/v1/auth/logout` response validation, credentials
included for the API-owned refresh cookie, clearing the memory-only access
token only after a validated success, preserving the token for retry after a
failed or malformed response, and an accessible responsive header sign-in /
sign-out action. No browser storage, token logging, logout-all UI, or backend
contract changes were introduced.

The branch finished clean and was fast-forward integrated as two focused
commits:

- `66f6def`: logout response type/parser and auth client transport;
- `389f426`: header session action, loading/error/retry states, and web
  runtime/static coverage.

Exact-head review confirmed base `0d2223f`, six intended files, two focused
commits, clean status, valid ancestry, and no diff-check errors. The
independent Luna Kongminh/advisor reviewer timed out and was shut down after
bounded waits without a verdict; this is recorded as no independent ACCEPT,
not as review evidence. Merged-main evidence on `389f426` is API `250/250`,
web `41/41`, contracts `7/7`, plus typecheck, lint, production build, format
check, package payload verification, and a credential-shaped scan with no
real secret matches. Live PostgreSQL, Redis, Luna, browser interaction,
Docker, registry, and deployment evidence remain unverified.

The branch is complete and no longer active; historical refs and worktrees
remain frozen and are not eligible for wholesale cleanup. The next bounded
scope must be selected only after this clean pushed checkpoint.

## Settings and transport-security resolution — 2026-08-08

The next two bounded slices were based exactly on the post-metadata checkpoint
`576a1ab`, and were kept separate from the dirty history and review-process
branches. The settings slice was implemented as `0bc05c7` on
`feature/settings-ui` and fast-forward merged into `main`. It adds the
authenticated `/settings` route, strict password-change transport and success
envelope validation, memory-only token handling, re-authentication messaging,
and deterministic web coverage. The branch was deleted after clean exact-head
validation; its generated dependency residue is preserved at
`D:\worktrees\preserved-settings-ui-20260808`.

The transport-security slice was implemented as `e5d97ad` on
`feature/security-hardening` from the same exact base. It adds validated
production CORS origin configuration, exact-origin credential handling and
safe denials, bounded JSON/URL-encoded body parsers, parser error envelopes,
CSP/HSTS and related headers, Express fingerprint suppression, environment
tests, and API security coverage. The worker initially exposed a missing direct
`express` dependency; adding the declared runtime dependency resolved the
runtime import before the final gates. The clean worker commit was cherry-picked
onto the settings checkpoint as `2b146a5`, pushed to `origin/main`, and its
equivalent branch ref was removed only after a fresh zero-unique-commit
`git cherry` recheck.

Exact-head evidence at `2b146a5`:

- `pnpm test`: API `268/268`, web `44/44`, contracts `7/7`;
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and
  `pnpm package:check`: pass;
- Prisma validation/generation with a process-local dummy URL, diff-check, and
  credential-shaped scan: pass;
- `main` and `origin/main` resolve to
  `2b146a5ba9701faf02266055032ec58894da81db`, and the main worktree is clean.

The fresh settings/security arbiter attempts timed out and were closed without
an independent ACCEPT; the completed Laplace/advisor and Kant/Kongminh
read-only audits are recorded as advisory findings, not approvals. The HTTP
slice closes explicit CORS, body-size, and response-header boundaries but does
not claim CSRF-token coverage, structured audit logging, or distributed rate
limiting. Chromium, live PostgreSQL/Redis/EVAL, external Luna/HTTP provider,
Docker daemon, registry publication, package publication, release tagging, and
deployment remain unverified. The remaining refs are intentionally protected:
clean-but-stale `feature/auth-api`, dirty `feature/history-filter-api`, and
dirty `feature/review-process-lock-v2`.

## Review detail, CI, and dependency resolution — 2026-08-08

The next bounded web slice started from exact base `30eafab` and stayed
disjoint from all preserved dirty branches. `feature/web-review-detail` added
strict owner-scoped detail transport in `ed7aea7` and the `/reviews/[id]`
route/history reopen flow in `32f1378`. The route validates the detail and
result envelopes, uses the memory-only Bearer token when authenticated, keeps
saved-review errors generic, and labels the deterministic `demo-*` fixture
boundary. Web tests reached `46/46`, typecheck/lint/production build and
format/diff/credential checks passed, and the two commits were fast-forward
merged/pushed as-is. The review-detail worktree was unregistered after merge;
ignored dependency residue was preserved when normal removal could not delete
the non-empty directory. Its Advisor arbiter returned no independent ACCEPT
because the worktree had already been removed after merge; merged-main evidence
remained clean.

The application CI slice started from exact base `30eafab` on
`ci/application-gates`. Worker commits `e0907f2`, `81bf9fc`, and `e294981`
were reviewed as a three-commit unit; they add `application-gates.yml`, the
format gate, and container-validation path coverage. They were cherry-picked
onto the review-detail main line as `295335b`, `f45b224`, and `a4b70d6`, then
pushed. Kongminh accepted exact worker head `e294981`. The workflow is
credential-free, least-privilege, and fail-closed; local actionlint/format/diff
checks pass. It does not claim hosted GitHub-run, live service, browser, Luna,
Docker, or deployment evidence.

The dependency-audit slice started from exact base `a4b70d6` on
`fix/dependency-audit` and merged as `953e7da`. It updates Playwright to the
patched `1.55.1` release and records `effect: 3.20.0` plus `js-yaml: 5.2.2`
workspace overrides until upstream manifests stop pinning vulnerable
versions. The lockfile is consistent; API `268/268`, web `46/46`, contracts
`7/7`, typecheck, lint, build, format, package, Prisma, diff, and credential
checks pass, and `pnpm audit --audit-level=high` reports no known
vulnerabilities. Advisor/Banach accepted the exact head. Browser execution and
live dependency/provider/runtime publication gates remain open.

The pushed coordinator checkpoint is now
`953e7da627d75bda394cdcfae2cee3a0199321be`, with `main` and `origin/main`
aligned and clean. Remaining refs are intentionally protected:
clean-but-stale `feature/auth-api`, dirty `feature/history-filter-api`, and
dirty `feature/review-process-lock-v2`. Completed settings, security,
review-detail, CI, and dependency refs were removed only after exact-head or
patch-equivalence checks; no broad cleanup or reset was used.

## Continuation: release truth, history workspace, and current head — 2026-08-08

This append-only continuation supersedes stale status statements only for the
current evidence boundary. It does not rewrite the historical checkpoint
sections above.

### Exact source boundaries

- Historical deterministic checkpoint: `953e7da627d75bda394cdcfae2cee3a0199321be`.
- Released tag: `v0.1.4` resolves to
  `c3d1fe81928062929009e58d47c911ee8d5625ec`.
- Current `main` and `origin/main`: `eeb7327452f0286f8ea512f1bf579bef31db0d92`.
- The current head is unreleased and contains 13 commits across 27 paths
  after the release tag.
- Master-prompt attachment provenance was recorded from
  `C:\Users\Admin\.codex\attachments\f57409b9-7413-4b5c-b370-278a6a490c2e\pasted-text.txt`;
  SHA-256 is
  `FD7435754F354ADEFECE3361D279C22DE38D6507758D3BF86945E5A7F19BE75D`.
  The attachment is not committed, so prompt traceability remains
  derived-only.

### Integrated bounded slices

- `41654f9`: safe database migration and seed commands with production guards.
- `4ddd53d`, `24a74fb`, `f5b51b5`, `8530807`: migration image, Compose startup
  ordering, offline Prisma engine, and CI assertions.
- `8941c5c`, `0b74df5`, `62e7b52`: owner-scoped review history filters,
  deterministic ordering, bulk soft-delete, tests, and API docs.
- `fb756ae`, `239d047`, `3619bed`, `eeb7327`: authenticated responsive web
  history transport/workspace/tests and strict outer envelope metadata.

### Current validation evidence

- Hosted Application gates pass at current head in run `31253446241`.
- Hosted Container validation passes at current head in run `31253446243`.
- Full local workspace gates pass at current head: API `271/271`, web
  `48/48`, contracts `7/7`, recursive typecheck/lint/build, format check, and
  package payload check.
- Web local evidence: 48/48 shell tests, typecheck, lint, production build,
  Prettier check, diff check, and credential-shaped scan pass.
- Current web Luna arbiter sequence: agent
  `019fe0f1-963c-70e1-a18f-aacbc38de181` held on permissive `meta`; agent
  `019fe0f6-e7de-7f11-8a3c-6a14c867b27e` accepted after `eeb7327`.
- Kongminh/Terra High advisor `019fe0e2-13e1-7a60-89da-f54a35a71f21` held
  only the documentation continuation until the release/current-head,
  provenance, license, and worktree boundaries were recorded. It accepted
  the existing release artifact as an artifact, not a deployment.

### Release and legal disposition

- GitHub Release `v0.1.4` is published with no assets.
- Container release run `31247857378` succeeded for `c3d1fe8`.
- GHCR and Docker Hub API/Web digests are recorded in
  `plans/reports/20260808-repomento-continuation.md` and `docs/release.md`.
- The root and five workspace manifests remain `private: true`.
- No `LICENSE` file or package `license` field exists. Owner license choice is
  an open gate before any npm/public package or legal reuse claim.
- GitHub Packages REST metadata was not queried because the available token
  lacks `read:packages`; no stronger API claim is made.

### Branch/worktree ledger

- Completed `feature/web-review-history` was based exactly on `62e7b52`,
  accepted at `eeb7327`, fast-forward merged, pushed, and its branch ref was
  deleted.
- Its worktree registration was removed. Normal directory removal stopped on
  non-empty generated dependency/build residue; no force deletion was used.
- Protected dirty/stale refs remain inventory-only: `feature/history-filter-api`,
  detached historical `8662b6e`, stale `feature/auth-api`, unmerged
  `docs/completeness`, and dirty `feature/review-process-lock-v2`.
- No broad reset, force branch deletion, or unrelated worktree cleanup is
  authorized by this continuation.

### Open gates and next bounded decision

Live PostgreSQL transaction/isolation, Redis/EVAL and multi-instance SSE,
external Luna/provider calls, browser journeys, production deployment,
independent attestation/SBOM verification, and license ownership remain open.
The next release must choose whether the post-tag current-head slices are in
scope, then publish a new exact semantic tag. `eeb7327` must not be described
as `v0.1.4`.
