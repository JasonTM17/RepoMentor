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
- Kongming architecture counsel is the only exception: the user explicitly
  allows a Terra counsel thread for advisory analysis only. Terra counsel may
  not edit files, run implementation work, merge branches, or act as an
  arbiter; all project changes and acceptance decisions remain Luna-owned.
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

The current local main checkpoint includes the accepted web-auth contract
integration at `5ccb4cb`, review-domain integration through `b33d7d6`, truthful
README/package/GitHub About/media updates through `3b1f3b1`, and the Docker
slice through local `3d98a4d`, the Phase 06 Luna boundary at `369c958`, and
Phase 07A orchestration through `6b2dfe4`, Phase 07B persistence through
`ce6222b`, Phase 07C transport through `cede60c`, the Phase 08A review
workspace through `0c46164`, plus auth hardening at `0b47a45`.
GitHub Actions run `31030844884` passed the
workflow lint, Hadolint, Dockerfile contract, Compose config, API/web image
builds, API `/health/live` smoke, and web `/` smoke. The Docker slice is
deliberately not called registry-published: the local Docker daemon is
unavailable, and Docker Hub namespace/credentials have not been supplied.
The release workflow is prepared with immutable tags, digest checks, SBOM,
provenance, and scan gates; a protected release ref and registry evidence are
still required.

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
| `main` | auth hardening | coordinator validation follow-up | `0b47a45` | accepted; rejects non-canonical Base64URL token encodings; full API/root tests pass |
| `main` | docs/release | Faraday Luna + coordinator follow-up | `54c039f`, `d7e873c`, `2da1bd5`, `4673295`, `3b1f3b1` | accepted; README/release metadata, real UI GIF, and CI evidence; no production/public-package claim |
| `main` | 13 | Raman Luna + manager arbiter | `014c5e7`, `9456850`, `cf2e62b`, `16a81d1`, `69f83ab`, `d910080`, `10f1b71`, `6448e67`, `952bbc5`, `dc238d3`, `14f0c3e`, `3d98a4d` | accepted; CI run `31030844884` passed Docker/Compose/build/smoke gates; registry publication pending |
| `main` | 13 | Volta Luna + manager arbiter | `eab4557`, `6e90530`, `8c0f0c0`, `86a1c69`, `2cb9c9d` | accepted Compose/env/docs slice; local startup and live smoke pending |

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
| phase-13-docs-release-media | documentation/media implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-docs-release-media` | accepted; worker `019fd2ac-2034-7752-83ef-e2d7cefda10e`; merged through `4673295` | Faraday report; real 3-frame UI GIF |
| phase-13-docker-release | Docker/CI implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-docker-release` | accepted; worker `019fd2b1-daad-7302-824c-adef31c220ff`; merged through `3d98a4d` | Raman report; CI `31030844884` green; live registry pending |
| phase-13-docker-compose-runtime | Compose/env/docs implementer | `gpt-5.6-luna` / `max` | `D:\worktrees\RepoMentor-docker-compose-runtime` | accepted; worker `019fd2d1-eb9d-7fd0-ab68-4f5f2b44073f`; merged through `2cb9c9d` | Volta report; Docker daemon/live startup unavailable |
| phase-13-container-advisor | supply-chain advisor | `gpt-5.6-terra` / `max` | read-only counsel | completed; worker `019fd2b2-1664-7780-9d71-72f8b7f4582c`; no edits | hold findings resolved statically; live publish still gated |

## Unresolved questions

- External OpenAI/PostgreSQL/Redis credentials and deployment targets are not
  present; local deterministic tests proceed, live checks remain explicit.
- Package versions and API details must be resolved from the installed runtime
  and current official documentation at the implementation point.
- Phase 02 checks prove the application/UI foundation and transport boundary;
  readiness is still application-only, Swagger production exposure remains a
  hardening follow-up, and full browser E2E begins in the later quality phase.
