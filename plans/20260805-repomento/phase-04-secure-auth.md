# Phase 04 — Secure authentication

Status: in progress. Depends on the Phase 03 checkpoint at `f41d92f` and its
documentation commit `8e20029`.

## Outcome

Deliver the first real persistence and identity boundary for RepoMentor:
registration, login, short-lived access tokens, hashed rotating refresh
sessions, logout/revocation, current-user lookup, and polished login/register
web flows. This phase is not a production certification; live PostgreSQL,
Redis, mail, and deployment checks remain explicitly reported.

## Ownership and sequencing

- API auth worker owns `apps/api/**`, `prisma/schema.prisma`,
  `prisma/migrations/**`, and the API manifest only.
- Web auth worker owns `apps/web/**` only and uses the documented auth API
  boundary; it must not edit API, Prisma, root config, or lockfiles.
- Coordinator owns package lockfile updates, shared transport-contract
  changes, integration, and final merge decisions.
- Only Luna with reasoning `max` may implement, test, review, or merge.
  Kongming/Terra remains advisory-only and cannot modify or accept code.

## Domain contract

### User

- `id`: CUID primary key for stable server-generated identity.
- `email`: normalized lowercase address with a database unique constraint.
- `passwordHash`: Argon2id output; never serialized or logged.
- `displayName`: bounded display value.
- `role`: `USER` or `ADMIN`.
- `status`: `ACTIVE` or `DISABLED`.
- `createdAt` and `updatedAt`.

### Session

- `id`: CUID primary key.
- `userId`: required relation to User with an index.
- `refreshTokenHash`: one-way hash only; raw refresh token exists only at the
  boundary that sets the cookie.
- bounded `userAgent` and a non-reversible `ipHash` when available.
- `expiresAt`, nullable `revokedAt`, and `createdAt`.
- indexes for user lookup and expiry/revocation checks.

The first migration must be immutable and append-only. It must not include
placeholder review tables. Auth schema decisions for identifiers, uniqueness,
status/soft-delete behavior, indexes, and transaction seams are recorded in
the migration/architecture report before merge.

## API behavior

Routes are under `/api/v1/auth`:

- `POST /register`
- `POST /login`
- `POST /refresh`
- `POST /logout`
- `POST /logout-all`
- `GET /me`
- `PATCH /password` may remain a separately documented follow-up if it would
  expand the first safe slice beyond the verified boundary.

Security requirements:

- Argon2id password hashing with a bounded password policy.
- Short-lived access token; refresh token is random, rotated on use, hashed in
  storage, and sent only through an HttpOnly cookie.
- `Secure` is enabled in production; `SameSite` and cookie path are explicit.
- Refresh reuse/revoked/expired sessions fail safely and revoke the session
  where appropriate.
- Login and registration credential errors do not reveal whether an email is
  registered; no raw password, token, cookie, or authorization header appears
  in logs or error details.
- Validation and response schemas exclude password hashes and token material.
- Tests use deterministic doubles when a live database/Redis is unavailable;
  they must not claim live integration.

## Web behavior and ak frontend quality gate

The UI worker must use `apps/web/DESIGN.md` and the installed
`ak:frontend-design` plus `ak:frontend-development` skills. Every auth screen
records a Design Read and keeps the Industrial/utilitarian thesis: code-review
workspace clarity, tinted cool neutrals, safety-orange action/focus accent,
strong condensed headings, readable body copy, and the line-gutter motif.

Required states include initial, field validation, focused, submitting,
server error, success/redirect, disabled, and narrow-screen layout. Verify:

- 375px and desktop layouts have no horizontal overflow;
- labels, descriptions, errors, and controls are programmatically associated;
- all interactive targets are at least 44px and focus-visible rings are clear;
- reduced motion is honored and no emoji is used as structural UI;
- generic safe error copy is shown instead of raw API failures;
- the existing shell remains honest about connection state.

## Focused commit slices

1. `feat(auth): add user persistence model`
2. `feat(auth): implement password hashing service`
3. `feat(auth): add token and cookie policy`
4. `feat(auth): add user registration flow`
5. `feat(auth): add login and access token issuance`
6. `feat(auth): implement refresh token rotation`
7. `feat(auth): add logout and session revocation`
8. `feat(web-auth): add login and registration pages`
9. `test(auth): add authentication boundary tests`
10. Coordinator lockfile, plan, report, and integration commits as separate
    `chore(deps)`/`docs(plan)` slices.

## Exit evidence

- Exact integrated HEAD and branch ledger updated.
- Prisma schema and first migration validate; migration is reviewed as
  append-only and contains only auth tables.
- API unit/boundary tests cover normalization, validation, hashing,
  generic-credential errors, token rotation, reuse/revocation, cookie flags,
  logout, logout-all, and me authorization.
- Web lint/typecheck/build and structural/accessibility tests pass, plus the
  ak frontend self-review evidence at 375px and desktop.
- Frozen install, root gates, diff/secret checks, and worktree boundaries pass.
- Any unavailable Docker/database/Redis checks are listed as limitations.
