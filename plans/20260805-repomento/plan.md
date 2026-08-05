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

Phase 04 is in progress. Its first independent checkpoints are the accepted
transport contract commit `b22d1c7` and the accepted web-auth sequence through
`3c4252a`. These checkpoints do not claim backend/session integration; the
Luna API manager is still completing the auth persistence and route boundary
in `D:\worktrees\RepoMentor-auth-api`.

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

## Unresolved questions

- External OpenAI/PostgreSQL/Redis credentials and deployment targets are not
  present; local deterministic tests proceed, live checks remain explicit.
- Package versions and API details must be resolved from the installed runtime
  and current official documentation at the implementation point.
- Phase 02 checks prove the application/UI foundation and transport boundary;
  readiness is still application-only, Swagger production exposure remains a
  hardening follow-up, and full browser E2E begins in the later quality phase.
