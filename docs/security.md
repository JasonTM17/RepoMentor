# Security and trust boundaries

This is the security posture of the repository checkpoint at
`a8439bfa3fd03405a3ed26f0cbdefe06b6c736bb`. It distinguishes implemented
controls from controls that still require a later implementation and live
verification.

## Identity and session handling

- Passwords are hashed through the API password-hasher service using Argon2id.
- The API returns a short-lived access token and keeps refresh state in hashed
  server-side sessions. Registration, login, and refresh are rate-limited in
  the process boundary; logout-all and password change revoke active sessions.
- The browser keeps the access token in an in-memory auth session. The API owns
  the refresh cookie. No access or refresh token is written to localStorage or
  sessionStorage by the web client.
- Every authenticated request resolves both the token claims and the current
  user/session state. Disabled users, revoked sessions, mismatched user/session
  ownership, and malformed tokens are rejected generically.

Relevant code: [`auth-access.guard.ts`](../apps/api/src/modules/auth/auth-access.guard.ts),
[`auth-token.service.ts`](../apps/api/src/modules/auth/auth-token.service.ts),
[`authClient.ts`](../apps/web/features/auth/api/authClient.ts), and
[`password-hasher.service.ts`](../apps/api/src/modules/auth/password-hasher.service.ts).

## Owner isolation

Review, result, event, history, usage, quota, retry, cancel, and delete
operations take the authenticated user ID. Prisma and in-memory repositories
repeat the owner predicate and exclude soft-deleted records. A client cannot
select another owner by sending a user ID in a route body or query. The
owner-scoped implementation is covered by deterministic API/repository tests;
it has not been proven against a live multi-tenant deployment.

## Luna and prompt-injection boundary

The review path pins provider `luna` and model `gpt-5.6-luna` in code. Review
requests cannot select a provider/model or submit a prompt-control option. The
prompt builder labels source and review metadata as untrusted, JSON-serializes
the source, escapes framing characters, and instructs the provider not to
follow source directives, execute code, call tools, browse, install packages,
or reveal hidden policy. Results are strict-schema validated and bounded before
being returned or persisted.

The provider uses a server-only `LUNA_API_KEY`, a fixed HTTPS base URL, bounded
timeouts/retries/response bytes, `store: false`, and safe typed error mapping.
The key is not included in documentation, fixtures, or commits. Optional RAG
suggestions are a separate disabled-by-default design and must follow
[ADR-001](architecture/adr-001-optional-rag-suggestion-provider.md); the review
path must not silently substitute a RAG provider.

## HTTP hardening

The API currently applies explicit transport controls in
[`apps/api/src/app.ts`](../apps/api/src/app.ts):

- exact normalized `http`/`https` CORS origins, credentials, bounded methods and
  headers, and no wildcard/reflected invalid origin;
- `128kb` JSON and URL-encoded body limits with safe `400`/`413` envelopes;
- request IDs and safe error envelopes;
- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, a restrictive CSP, production HSTS, and disabled
  Express `x-powered-by`.

These are explicit headers and middleware, not a claim that Helmet is installed.
The production environment requires an explicit non-wildcard CORS allowlist;
development/test use bounded localhost defaults when no list is supplied.

## Known security gaps

The current checkpoint does not claim:

- a synchronizer-token or double-submit-token CSRF defense;
- an `AuditLog` model or security audit trail;
- structured Pino-style request logging;
- live distributed auth rate limiting, quota admission, or Redis lock proof;
- dependency-aware readiness or a live PostgreSQL/Redis/Luna integration run;
- browser E2E execution, Docker startup, registry publication, or deployment.

Cookies retain the configured SameSite/secure policy, but any future cross-site
cookie mode must add an explicit CSRF design and tests before enablement. Do not
convert a deterministic test or a process-local metric into evidence for any of
these missing controls.

## Secrets and reporting

Keep runtime secrets in approved untracked/deployment secret stores. The
committed [`.env.example`](../.env.example) contains names and empty
placeholders only. Never echo, commit, or document a real API key, database
credential, JWT secret, refresh token, or cookie. The user-provided DeepSeek key
was not copied into the repository and is not part of the current runtime.
