# Security audit logging worker report

Date: 2026-08-08
Worker scope: sensitive-action audit logging only
Branch: `feature/security-audit-logging`
Base: `73f57f5f3689fc47154d45719f1255c711b0b290`
Worker commit: `8bdbe59` (`feat(audit): record sensitive user actions`)
Follow-up commit: focused guest review coverage (this report is included in
that commit).

## Handoff and boundary

The handoff initially created the temporary ref
`codex/luna-worker-security-audit-logging` at the exact clean base
`73f57f5`. The native worktree first appeared detached at that same commit.
The coordinator then switched the current `D:\RepoMentor` checkout onto the
existing intent-based ref `feature/security-audit-logging`, without creating or
renaming a branch. The corrected checkout remained clean at the same base
before implementation.

No other checkout, `main`, protected worktree, merge, push, reset, or cleanup
operation was performed by this worker. The temporary handoff ref is preserved
as coordinator inventory.

The worker read the supplied master prompt, the repository plan, and the Phase
10 security-hardening plan. No repository-root `AGENTS.md` was present.

## Understand -> decide

The API already has a request-ID middleware and authenticated request context.
The narrowest safe integration is a global interceptor that derives the audit
action from an exact route/method allowlist and records only after the handler
emits a success or failure. It never inspects request bodies, query objects,
authorization headers, cookies, error messages, or response values.

The explicit allowlist covers:

- Auth: register, login, current-user read, and password change.
- Session: refresh, single logout, and logout-all.
- Review: create, list, read, bulk delete, delete, retry, cancel, process,
  lifecycle events, and persisted result reads.
- Public review: anonymous transient guest review creation.

Each persisted record is bounded to:

```text
action, outcome, actorType, userId?, sessionId?, requestId,
route, method, statusCode, targetId?, occurredAt
```

Actor IDs and path target IDs accept only bounded identifier characters. Target
IDs come only from an allowlisted `:id` route parameter; bulk-delete body IDs
are intentionally not read. Anonymous records omit user and session IDs.
Routes are canonical allowlist values, so query strings and raw URLs cannot be
persisted.

Writes are asynchronous and fail open. `AuditLogService` bounds each adapter
write to 250 ms by default, swallows adapter and timeout failures, and never
delays or changes the request response. The Prisma adapter writes through the
existing transaction seam. A no-op sink is selected only when no
`DATABASE_URL` is configured, which keeps deterministic in-memory API boots
from attempting an unavailable database; normal configured deployments use the
Prisma adapter.

## Execute

Implementation commit `8bdbe59` contains only:

- `prisma/schema.prisma` and one idempotent migration at
  `prisma/migrations/20260808190000_add_audit_logs/migration.sql`.
- The audit types, exact route allowlist, bounded normalizer, fail-open service,
  Prisma adapter, deterministic in-memory repository, and no-op bootstrap sink
  under `apps/api/src/modules/audit/`.
- `apps/api/src/common/http/audit-log.interceptor.ts`.
- `apps/api/src/app.module.ts` global interceptor/module wiring.
- Focused deterministic tests under `apps/api/test/audit/`.

The migration uses duplicate-object-safe enum creation,
`CREATE TABLE IF NOT EXISTS`, and `CREATE INDEX IF NOT EXISTS` statements.

## Follow-up acceptance review — guest review action

The coordinator identified `POST /api/v1/guest/reviews`. The master prompt
requires audit logging for sensitive actions, and this endpoint accepts
untrusted source and invokes the review provider even though it is transient
and anonymous. The decision is to audit it as `REVIEW_GUEST_CREATE`.

The follow-up adds the exact `POST /guest/reviews` allowlist entry with `ANY`
actor policy, so no auth context produces an `ANONYMOUS` record. It persists no
body, query, or target data. The existing pre-merge idempotent migration was
adjusted to include the enum value and to add it with `IF NOT EXISTS` when an
older copy of the enum already exists; no second migration was added.

## Verify

All commands were run in `D:\RepoMentor` on the corrected feature ref.

- Focused audit tests: **11/11 passed**.
- Coordinator full-workspace verification after the guest-review follow-up on
  candidate `075a2673fad786d9634ebd32479f397188c690f`: `pnpm test` passed;
  API **282/282**, web **48/48**, contracts **7/7**.
- `pnpm --filter @repomentor/api lint`: passed.
- `pnpm --filter @repomentor/api typecheck`: passed.
- `pnpm --filter @repomentor/api build`: passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `pnpm format:check`: passed.
- `pnpm db:validate`: passed with the process-local non-secret placeholder
  `postgresql://localhost:5432/repomentor_validation`.
- `pnpm db:generate`: passed with the same placeholder.
- `git diff --check`: passed.
- Explicit staged-path check: passed; exactly the 11 intended implementation,
  schema, migration, and focused-test paths were staged for `8bdbe59`.
- High-signal credential scan over the staged diff: passed with no key, token,
  private-key, or provider-secret pattern matches.

Follow-up verification:

- Focused guest-review audit tests: **11/11 passed**.
- Follow-up API lint, typecheck, build, format, diff-check, and credential
  scan: passed.

## Limitations and arbitration notes

- No live PostgreSQL migration, database write, Redis, Luna, deployment, or
  production-readiness claim was made. The Prisma adapter mapping is tested
  with a deterministic transaction fake; live database behavior remains open.
- The interceptor records allowlisted handler outcomes. Guard failures that
  occur before Nest invokes interceptors and routes outside the allowlist are
  intentionally not recorded by this slice.
- Audit persistence is intentionally best effort: database rejection,
  configuration absence, and timeout do not fail the user request.
- RBAC, pricing, UI, provider behavior, and unrelated security refactors were
  not changed.
- The follow-up is ready for independent exact-head arbitration: exact base
  ancestry, 12-file cumulative candidate scope, and passing deterministic
  gates.
  Coordinator merge/push remains outstanding.
