# RepoMentor

RepoMentor is a developer-first workspace for AI-assisted code review and
programming practice. It is a production-oriented monorepo, but the current
repository checkpoint is an application slice, not a production release.

The documentation below describes the exact local checkpoint at
`eab8131fdf8f6937b0e21c85aedc43c3e9e38013`, including the quota-admission
fingerprint configuration wired at this head. The accepted 09D2A integration
gate is recorded at `0b573a2`; neither SHA is a release, tag, registry, or
package-publication claim.

## Current status

This checkpoint contains:

- a Next.js App Router web shell with home, sign-in, and registration routes;
- a NestJS API with application health, authentication, and owned review
  persistence routes;
- an isolated server-side Luna review boundary with fixed provider/model
  selection, strict bounded output validation, prompt-injection framing, typed
  retry/timeout/cancellation/error handling, deterministic tests, and
  server-only `LUNA_*` configuration;
- shared Zod contracts for success envelopes, problem envelopes, health, and
  authentication payloads;
- Prisma schema and forward-only PostgreSQL migrations for users, sessions,
  and reviews;
- a local-only Docker Compose application layer for the API and web images,
  PostgreSQL, and Redis, with localhost-bound ports and health-gated startup;
- owner-scoped usage summary, history, and quota read routes;
- an authenticated quota-admission path for `POST /api/v1/reviews` with a
  bounded `Idempotency-Key`, Redis reservation markers, durable Prisma
  `QuotaAdmission` state, versioned keyed request fingerprints, and a
  Prisma-backed review finalizer;
- focused unit and in-memory controller tests for the implemented boundaries.

The review API now includes a narrow authenticated synchronous processing and
persisted-result transport seam plus authenticated quota admission. Admission
canonicalizes the request, hashes idempotency material, reserves the
authenticated Redis quota, and finalizes the preallocated review and admission
state through the Prisma boundary. It is tested with deterministic Redis
executors, in-memory repositories, and a fake Luna provider; there is no live
PostgreSQL, Redis/EVAL, HTTP provider, or external Luna call. A guest HTTP
route, process-lock wiring, queue, SSE or other result streaming, connected
editor, production deployment, registry publication, and package publication
remain outside this checkpoint. The container workflow is prepared for
validation and a future release, but it is not a registry publication or
deployment.

## Architecture

```text
apps/web/       Next.js 16 web shell and auth forms
apps/api/       NestJS API, auth/session/review boundaries, isolated Luna AI provider, Prisma adapters
packages/contracts/  Zod schemas and TypeScript types shared by API/tests
prisma/         PostgreSQL schema and append-only migrations
docker-compose.yml   Local API/web images plus PostgreSQL and Redis services
docs/           Architecture decisions, release boundaries, and media capture
```

Useful project notes:

- [API route and health notes](apps/api/README.md)
- [Web visual foundation and honest UI boundaries](apps/web/DESIGN.md)
- [Optional RAG suggestion provider ADR](docs/architecture/adr-001-optional-rag-suggestion-provider.md)
- [Prisma migration ownership](docs/architecture/database-migration-ownership.md)
- [Release, tag, and package boundaries](docs/release.md)
- [UI media capture script](docs/media/capture-ui-media.ps1)

## Implemented routes

### Web

| Route                                    | Current behavior                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/`                                      | Static product shell with review preview, learning-loop copy, and an explicit empty state. |
| `/login`                                 | Client-side sign-in form wired to `POST /api/v1/auth/login`.                               |
| `/register`                              | Client-side registration form wired to `POST /api/v1/auth/register`.                       |
| Loading, error, and not-found boundaries | Honest shell-preserving states for the current App Router surface.                         |

The web app does not load repository data at this checkpoint. The home review
preview is labeled static and the empty state says that no reviews exist yet.

### API

The API uses `/api/v1` as its global prefix except for the two health routes.
Successful responses are wrapped as `{ "data": ... }`; failures use an
`{ "error": ... }` problem envelope and a bounded `X-Request-Id` header.

| Method and route                   | Implemented behavior                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health/live`                 | Process liveness: `{ "data": { "status": "ok" } }`.                                                                              |
| `GET /health/ready`                | Application-only readiness. It does not probe PostgreSQL, Redis, or AI.                                                          |
| `GET /api/docs`                    | Swagger UI for the current API document.                                                                                         |
| `POST /api/v1/auth/register`       | Validates input and returns `202` with `{ "accepted": true }`; new and duplicate emails are intentionally indistinguishable.     |
| `POST /api/v1/auth/login`          | Returns a short-lived Bearer access token and public user data in a `201` success envelope.                                      |
| `POST /api/v1/auth/refresh`        | Reads and rotates the API-owned refresh cookie.                                                                                  |
| `POST /api/v1/auth/logout`         | Revokes the presented refresh session when valid and clears the cookie; malformed or repeated logout is idempotent.              |
| `POST /api/v1/auth/logout-all`     | Authenticated session revocation for every session belonging to the user.                                                        |
| `GET /api/v1/auth/me`              | Returns the authenticated public user.                                                                                           |
| `POST /api/v1/reviews`             | Requires authentication and a bounded `Idempotency-Key`; reserves quota and creates or safely replays an owned `PENDING` review. |
| `GET /api/v1/reviews`              | Lists only the authenticated user's active reviews with page, limit, and status filtering.                                       |
| `GET /api/v1/reviews/:id`          | Returns one owned review, including source code.                                                                                 |
| `DELETE /api/v1/reviews/:id`       | Soft-deletes one owned review and returns `204`.                                                                                 |
| `POST /api/v1/reviews/:id/retry`   | Moves an owned review back to `PENDING` when the status policy allows it.                                                        |
| `POST /api/v1/reviews/:id/cancel`  | Moves an owned review to `CANCELLED` when the status policy allows it.                                                           |
| `POST /api/v1/reviews/:id/process` | Runs one bounded synchronous Luna review; returns a source-free completion or idempotent skip response.                          |
| `GET /api/v1/reviews/:id/result`   | Returns one owned completed result with validated findings and safe Luna execution metadata; non-completed reviews return `409`. |
| `GET /api/v1/usage/summary`        | Returns an owner-scoped, source-free usage summary.                                                                              |
| `GET /api/v1/usage/history`        | Returns owner-scoped, source-free history with bounded filters and stable pagination.                                            |
| `GET /api/v1/usage/quota`          | Returns the authenticated UTC-day quota read model and configured limits.                                                        |

Review statuses are `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, and
`CANCELLED`. Processing accepts no provider, model, or prompt options from the
client. Successful processing responses contain only the review ID, status,
outcome, and result-availability flag; result data is available only through
the owner-scoped result endpoint.

## Local setup

Prerequisites:

- Node.js `>=22.0.0` (the validation runtime was `v24.12.0`);
- pnpm `11.0.9`, selected by the root `packageManager` field;
- Docker is optional for the unit/in-memory checks; a Docker daemon is required
  for Compose image builds, startup, and live smoke checks.

Install the locked workspace without running third-party lifecycle scripts:

```bash
corepack enable
pnpm run deps:install
```

Copy `.env.example` to an untracked `.env` and fill values locally. Compose
requires `DATABASE_URL` and `REDIS_URL` to use the `postgres` and `redis`
service names inside the Compose network; URL-encode credential components
before placing them in those URLs. The API also requires two different
authentication secrets of at least 32 bytes. Generate secrets locally instead
of copying credentials into a command history or commit:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Quota and admission configuration is server-side. The authenticated daily
limits default to QUICK/STANDARD/DEEP `20/10/3` and are configured with
`USER_QUICK_REVIEWS_PER_DAY`, `USER_STANDARD_REVIEWS_PER_DAY`, and
`USER_DEEP_REVIEWS_PER_DAY` (each bounded from `0` to `100000`).
`QUOTA_ADMISSION_FINGERPRINT_SECRET` is required outside test-only injection,
must be a non-empty UTF-8 secret of 32 to 4096 bytes, and is used only by the
server to derive versioned request-fingerprint hashes. Compose requires it;
keep the `.env.example` placeholder empty and never commit a real value.

The Redis primitive configuration also accepts `GUEST_QUICK_REVIEWS_PER_DAY`
(default `3`), `USAGE_REDIS_QUOTA_TTL_MAX_SECONDS` (default `86400`, bounded
to `1..86400`), and `USAGE_REDIS_LOCK_TTL_MS` (default `10000`, bounded to
`1000..60000`). Guest quota remains a primitive/configuration boundary with no
guest HTTP route, and the lock TTL is not evidence that processing has a wired
process lock.

The Luna provider boundary is server-side only. Keep `LUNA_API_KEY` in the API
runtime and never expose it to clients. `LUNA_API_BASE_URL` is fixed to
`https://api.openai.com/v1`, the deployment-owned HTTPS allowlisted endpoint;
it is not an arbitrary provider or model selection setting. These variables do
not prove live provider access; deterministic transport tests use a fake Luna
provider and no external AI request is made by the validation suite.

For Compose, set `API_HOST_PORT` and `WEB_HOST_PORT` to unused localhost ports.
`NEXT_PUBLIC_API_ORIGIN` is required as a web image build argument and must be
browser-reachable, normally `http://localhost:<API_HOST_PORT>`. Do not use the
internal `api:3000` service URL here: the value is baked into the Next.js
browser bundle, so changing it requires rebuilding the web image.

The local Compose URL shapes are:

```dotenv
API_HOST_PORT=18080
WEB_HOST_PORT=18081
NEXT_PUBLIC_API_ORIGIN=http://localhost:18080
DATABASE_URL=postgresql://<user>:<url-encoded-password>@postgres:5432/<db>
REDIS_URL=redis://:<url-encoded-password>@redis:6379/0
```

After `DATABASE_URL` is available, prepare generated local artifacts and
validate the schema:

```bash
pnpm db:generate
pnpm --filter @repomentor/contracts build
pnpm db:validate
```

`db:generate` and `db:validate` inspect the Prisma schema; they do not prove
that PostgreSQL is reachable. To validate and start the local API/web plus
PostgreSQL/Redis Compose layer, populate the Compose variables first and run:

```bash
docker compose config --quiet
docker compose up --build -d
```

The web is published at `http://localhost:<WEB_HOST_PORT>` and the API
liveness endpoint is at `http://localhost:<API_HOST_PORT>/health/live`.
Compose waits for PostgreSQL and Redis container health before starting the
API, then waits for the API's process-liveness health before starting the web.
The API healthcheck only tests `/health/live`, and the web healthcheck only
tests `/`; neither claims dependency-aware readiness.

## Development commands

Run the commands from the repository root:

| Command                                     | Purpose                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm run deps:install`                     | Frozen dependency install with lifecycle scripts disabled.                                 |
| `pnpm db:generate`                          | Generate the Prisma client after `DATABASE_URL` is set.                                    |
| `pnpm --filter @repomentor/contracts build` | Build the shared contract package before API typecheck/test/build.                         |
| `pnpm dev`                                  | Run present workspace `dev` scripts; use explicit ports when running web and API together. |
| `pnpm --filter @repomentor/api dev`         | Run the NestJS API.                                                                        |
| `pnpm --filter @repomentor/web dev`         | Run the Next.js web shell.                                                                 |
| `pnpm lint`                                 | Lint the root and present workspace packages.                                              |
| `pnpm typecheck`                            | Type-check the workspace after generated artifacts are prepared.                           |
| `pnpm test`                                 | Run the web, contracts, and API test suites.                                               |
| `pnpm build`                                | Build the contracts, static web app, and API after preparation.                            |
| `pnpm format:check`                         | Check Prettier formatting.                                                                 |

The API and web images both listen on container port `3000`; Compose publishes
them on the required `API_HOST_PORT` and `WEB_HOST_PORT` localhost bindings.
For direct `pnpm` development, use separate shells and set
`NEXT_PUBLIC_API_ORIGIN` to the browser-reachable API origin for the web
process.

## Authentication and review API boundary

Authentication is server-owned:

- passwords are hashed with Argon2id and are never returned;
- email and display-name input is normalized and bounded;
- access tokens are returned only in the login/refresh success payload;
- refresh tokens are stored in a rotated, API-owned cookie and are not written
  to browser storage by the web client;
- refresh-token replay revokes the session;
- login, registration, and refresh have bounded in-memory rate limits;
- production rejects insecure cookie configuration and requires distinct
  high-entropy JWT secrets.

Review authorization is user-owned at the repository boundary. List, detail,
delete, retry, cancel, process, and result operations all scope by the
authenticated user ID. Submitted source is treated as untrusted data and is
stored as review input; the current repository never executes it. The
processing route pins the server-owned Luna provider/model and never accepts
client prompt overrides.

Quota admission keeps raw idempotency material out of durable records and stores
only the request fingerprint hash plus explicit version metadata. The
fingerprint secret is server-only, HTTP callers cannot supply the fingerprint
metadata, and ambiguous Redis or persistence outcomes fail closed into bounded
safe statuses rather than being silently retried.

## Validation evidence

The following checks were run in this worktree on Node `v24.12.0` and pnpm
`11.0.9`. The Prisma commands used a syntactically valid local-only URL in
the process environment; they did not connect to PostgreSQL.

| Check                                          | Result and evidence                                                                                                                                                                                                                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepted 09D2A API gate                        | Pass: the repository plan records `192/192` API tests across 38 suites at the accepted authenticated-admission integration checkpoint `0b573a2`.                                                                                                                                             |
| Current exact-head API rerun                   | Pass: `pnpm --filter @repomentor/api test` at `eab8131fdf8f6937b0e21c85aedc43c3e9e38013` reports `192` tests, `38` suites, `192` passed, `0` failed. The run uses deterministic adapters, in-memory repositories, and fake Luna; it is not live-service evidence.                            |
| Focused admission/config evidence              | Pass within the current API run, not additive to `192/192`: authenticated HTTP orchestration `10/10`, fingerprint configuration `6/6`, and fingerprint derivation `6/6`.                                                                                                                     |
| Prisma and shared-contract preparation         | Pass: `pnpm db:generate`, `pnpm --filter @repomentor/contracts build`, and `pnpm db:validate` with a local-only URL; no PostgreSQL connection.                                                                                                                                               |
| `docker compose config --quiet`                | Pass with safe dummy values, including the required fingerprint secret; this validates configuration only.                                                                                                                                                                                   |
| Historical GitHub Actions container validation | Pass: run [`31030844884`](https://github.com/JasonTM17/RepoMentor/actions/runs/31030844884) linted workflows/Dockerfiles, validated Compose, built API/web images, and smoked `/health/live` and `/`. It is historical infrastructure evidence, not exact-head release or publication proof. |
| Local Docker daemon and live Compose smoke     | Not available in this environment; the Docker Desktop daemon was not running, so local startup and PostgreSQL/Redis dependency health remain unverified.                                                                                                                                     |
| Real UI media capture                          | Pass: Chrome captured the running Next UI at `/`, `/login`, and `/register`; ImageMagick encoded the committed GIF. This is media evidence, not browser visual QA.                                                                                                                           |

## Security and environment boundaries

Never commit `.env`, API keys, database credentials, JWT secrets, private
keys, cookies, access tokens, refresh tokens, or user source code. The
committed `.env.example` contains names and empty placeholders only.

The integrated code-review boundary is Luna-only by project policy: provider
`luna`, model `gpt-5.6-luna`, with QUICK/STANDARD/DEEP mapped to low/medium/max
reasoning. It enforces bounded structured results, source/instruction prompt
isolation, typed retry/timeout/cancellation/provider errors, and safe handling
that does not log source or secrets. `LUNA_API_KEY` is server-only and
`LUNA_API_BASE_URL` is the fixed HTTPS allowlisted endpoint
`https://api.openai.com/v1`. The review API still makes no live AI call.

Optional DeepSeek RAG suggestions remain disabled and deferred by
[ADR-001](docs/architecture/adr-001-optional-rag-suggestion-provider.md); no
DeepSeek secret is added, documented, or stored in this checkpoint.

## Release and media notes

The root package is intentionally private and there is no public package
artifact or deployment in this checkpoint. See [docs/release.md](docs/release.md)
for prerelease/tag guidance, immutable artifact expectations, GitHub About
values, and the missing-license release blocker.

![RepoMentor UI shell capture](docs/media/repomentor-ui.gif)

_This is a real capture of the running Next web UI shell. It shows static
routes only; it does not show a live API session, authenticated data,
PostgreSQL, Redis, AI output, or a production deployment._

## Known limitations

- No live PostgreSQL or Redis service was available or verified by the checks
  above. API integration tests override the Prisma repositories with in-memory
  implementations.
- The authenticated quota-admission path and synchronous processing/result
  routes are covered with deterministic Redis executors, fake Luna, and
  in-memory repositories only. There is no live Redis EVAL, PostgreSQL
  transaction/isolation, HTTP provider, or external Luna call.
- Guest quota is not exposed through an HTTP route, and the Redis process-lock
  primitive is not wired into the processing route.
- The web shell is not connected to a review dashboard or repository data.
- The captured GIF is not a browser visual-regression baseline and does not
  claim a live browser session or backend integration.
- The Compose definition now covers local API, web, PostgreSQL, and Redis
  services. GitHub Actions validated image builds and HTTP smoke, but the
  local Docker daemon was unavailable, so local Compose startup and
  PostgreSQL/Redis dependency health remain unverified.
- `NEXT_PUBLIC_API_ORIGIN` is a web build-time value; changing the browser API
  origin requires rebuilding the web image. The Compose healthchecks do not
  provide dependency-aware API readiness.
- The root package and every current workspace package are private; no npm or
  other public package artifact is claimed. No tag, registry publication, or
  deployment has happened.
- No license file or package `license` field is present. Treat licensing as a
  blocker for a public package or public release until the project owner adds
  a license supported by repository evidence.
