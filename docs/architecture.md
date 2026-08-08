# RepoMentor architecture

This document describes the current repository checkpoint at
`a8439bfa3fd03405a3ed26f0cbdefe06b6c736bb`. It is an implementation map, not a
claim that the system is deployed or production-ready.

## System shape

```text
Browser (Next.js web)
        │ memory-only Bearer access token + API-owned refresh cookie
        ▼
NestJS API (/api/v1)
   ├── auth/session boundary ─────── PostgreSQL via Prisma
   ├── owner-scoped review boundary ─ PostgreSQL via Prisma
   ├── quota/admission and locks ──── Redis (shared executor seam)
   └── server-selected review ─────── Luna: gpt-5.6-luna
```

The browser is implemented in [`apps/web`](../apps/web). The API bootstrap,
global validation, response envelopes, request IDs, CORS, body limits, and
transport headers are in [`apps/api/src/app.ts`](../apps/api/src/app.ts) and
[`apps/api/src/main.ts`](../apps/api/src/main.ts). Persistence is defined by
[`prisma/schema.prisma`](../prisma/schema.prisma). Local orchestration is in
[`docker-compose.yml`](../docker-compose.yml).

## Request flow

1. The web client logs in or refreshes through the API. The API returns a
   short-lived access token and owns the refresh cookie.
2. An authenticated review request is checked by `AuthAccessGuard`, validated,
   and admitted through the bounded `Idempotency-Key` and quota boundary.
3. The review is persisted as an owned record. Processing accepts an empty body;
   provider, model, prompt, output schema, retry, timeout, and cancellation
   policy are server-controlled.
4. `ReviewRunCoordinator` and the review-processing services run the pinned
   Luna provider, validate the strict result, persist the result/usage, and
   expose safe status/result envelopes.
5. History, detail, result, events, usage, quota, cancellation, retry, and
   deletion operations pass the authenticated user ID into repository methods.

The route surface is summarized in [docs/api-design.md](api-design.md). The
review prompt and trust boundary are specified in
[docs/ai-prompt-design.md](ai-prompt-design.md).

## Component boundaries

### Web

The Next.js app contains login, registration, dashboard, history, usage,
settings, new-review, and `/reviews/[id]` surfaces. Authenticated transports
use the API when an in-memory session exists; deterministic guest/demo fixtures
are labeled and are not live backend evidence. The web does not own refresh
tokens or database access.

### API

The NestJS modules separate auth, health, guest review, AI, review processing,
Redis primitives, and usage/quota admission. Global validation rejects unknown
properties and transforms bounded DTOs. Errors use the shared safe envelope and
request ID boundary rather than exposing provider or persistence details.

### Persistence and coordination

PostgreSQL is the durable source for users, sessions, reviews, lifecycle events,
results, usage, and quota-admission intents. Redis provides the configured
quota, stream, and process-lock primitives. The database model and migration
rules are in [docs/database-design.md](database-design.md). A local or CI
deterministic test does not establish that a live PostgreSQL/Redis deployment,
Redis `EVAL`, transaction isolation, or multi-instance lease fencing works.

### AI boundary

The review capability is hard-pinned in
[`apps/api/src/modules/ai/ai.types.ts`](../apps/api/src/modules/ai/ai.types.ts)
to provider `luna`, model `gpt-5.6-luna`, and the supported reasoning efforts.
The only configured HTTP base URL is the allowlisted OpenAI-compatible endpoint
implemented by [`luna-openai.provider.ts`](../apps/api/src/modules/ai/luna-openai.provider.ts).
Optional RAG suggestions are a separate, disabled design boundary; they are not
part of review routing. See [ADR-001](architecture/adr-001-optional-rag-suggestion-provider.md).

## Deliberate non-boundaries

The current code does not provide dependency-aware `/health/ready`; readiness
is application-only. It has no `AuditLog` model, no synchronizer or double-submit
CSRF token, no proven structured Pino request log, and no live distributed quota
or rate-limit run. HTTP hardening is implemented with explicit headers and
limits rather than a Helmet dependency. These are tracked limitations, not
implicit capabilities; see [docs/security.md](security.md) and
[docs/testing-strategy.md](testing-strategy.md).

Existing architecture decisions live under
[`docs/architecture/`](architecture/), including migration ownership and the
optional RAG provider boundary. No duplicate `docs/adrs/` set is introduced.
