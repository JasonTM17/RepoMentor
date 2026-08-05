# RepoMentor

RepoMentor is a developer-first workspace for AI-assisted code review and
programming practice. It is a production-oriented monorepo, but the current
repository checkpoint is an application slice, not a production release.

The documentation below describes the implemented checkpoint at
[`7a4961e`](https://github.com/JasonTM17/RepoMentor/commit/7a4961e), which is
the base of the `docs/release-media` worktree. It does not describe planned
features as if they were available.

## Current status

This checkpoint contains:

- a Next.js App Router web shell with home, sign-in, and registration routes;
- a NestJS API with application health, authentication, and owned review
  persistence routes;
- shared Zod contracts for success envelopes, problem envelopes, health, and
  authentication payloads;
- Prisma schema and forward-only PostgreSQL migrations for users, sessions,
  and reviews;
- a local-only Docker Compose application layer for the API and web images,
  PostgreSQL, and Redis, with localhost-bound ports and health-gated startup;
- focused unit and in-memory controller tests for the implemented boundaries.

The following are not implemented at this checkpoint: an AI provider or review
worker, Redis-backed application usage, review result generation, streaming, a
connected editor, production deployment, registry publication, or package
publication. The container build workflow is implemented and validated on
GitHub-hosted runners, but it is not a registry publication or deployment.

## Architecture

```text
apps/web/       Next.js 16 web shell and auth forms
apps/api/       NestJS API, auth/session boundary, review service, Prisma adapters
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

| Method and route                  | Implemented behavior                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /health/live`                | Process liveness: `{ "data": { "status": "ok" } }`.                                                                          |
| `GET /health/ready`               | Application-only readiness. It does not probe PostgreSQL, Redis, or AI.                                                      |
| `GET /api/docs`                   | Swagger UI for the current API document.                                                                                     |
| `POST /api/v1/auth/register`      | Validates input and returns `202` with `{ "accepted": true }`; new and duplicate emails are intentionally indistinguishable. |
| `POST /api/v1/auth/login`         | Returns a short-lived Bearer access token and public user data in a `201` success envelope.                                  |
| `POST /api/v1/auth/refresh`       | Reads and rotates the API-owned refresh cookie.                                                                              |
| `POST /api/v1/auth/logout`        | Revokes the presented refresh session when valid and clears the cookie; malformed or repeated logout is idempotent.          |
| `POST /api/v1/auth/logout-all`    | Authenticated session revocation for every session belonging to the user.                                                    |
| `GET /api/v1/auth/me`             | Returns the authenticated public user.                                                                                       |
| `POST /api/v1/reviews`            | Creates an authenticated, user-owned review in `PENDING` status; default mode is `STANDARD`.                                 |
| `GET /api/v1/reviews`             | Lists only the authenticated user's active reviews with page, limit, and status filtering.                                   |
| `GET /api/v1/reviews/:id`         | Returns one owned review, including source code.                                                                             |
| `DELETE /api/v1/reviews/:id`      | Soft-deletes one owned review and returns `204`.                                                                             |
| `POST /api/v1/reviews/:id/retry`  | Moves an owned review back to `PENDING` when the status policy allows it.                                                    |
| `POST /api/v1/reviews/:id/cancel` | Moves an owned review to `CANCELLED` when the status policy allows it.                                                       |

Review statuses are `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, and
`CANCELLED`. The API currently persists the review boundary and lifecycle
seams only. Nothing invokes an AI provider or changes a review to a generated
result in this checkpoint.

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
delete, retry, and cancel operations all scope by the authenticated user ID.
Submitted source is treated as untrusted data and is stored as review input;
the current repository never executes it and does not send it to an AI
provider.

## Validation evidence

The following checks were run in this worktree on Node `v24.12.0` and pnpm
`11.0.9`. The Prisma commands used a syntactically valid local-only URL in
the process environment; they did not connect to PostgreSQL.

| Check                                       | Result and evidence                                                                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run deps:install`                     | Pass, frozen install with scripts disabled.                                                                                                                                                           |
| `pnpm db:generate`                          | Pass, generated Prisma Client `6.19.0`; no database connection.                                                                                                                                       |
| `pnpm --filter @repomentor/contracts build` | Pass.                                                                                                                                                                                                 |
| `pnpm db:validate`                          | Pass; schema accepted by Prisma `6.19.0`.                                                                                                                                                             |
| `pnpm lint`                                 | Pass for root, API, web, and contracts.                                                                                                                                                               |
| `pnpm typecheck`                            | Pass after generated Prisma and contracts artifacts were prepared.                                                                                                                                    |
| `pnpm test`                                 | Pass: 16 web tests, 5 contract tests, and 40 API tests.                                                                                                                                               |
| `pnpm build`                                | Pass: static web routes `/`, `/_not-found`, `/login`, and `/register` plus API and contracts.                                                                                                         |
| `pnpm format:check`                         | Pass.                                                                                                                                                                                                 |
| `docker compose config --quiet`             | Pass with safe URL-safe dummy values; resolved the API/web services, service-DNS URLs, required ports, dependencies, volumes, and internal network.                                                   |
| Missing required Compose variables          | Pass: config rejected missing `NEXT_PUBLIC_API_ORIGIN`, `API_HOST_PORT`, `WEB_HOST_PORT`, and dependency URL inputs.                                                                                  |
| GitHub Actions container validation         | Pass: run [`31030844884`](https://github.com/JasonTM17/RepoMentor/actions/runs/31030844884) linted workflows/Dockerfiles, validated Compose, built API/web images, and smoked `/health/live` and `/`. |
| Local Docker daemon and live Compose smoke  | Not available in this environment; local Compose startup and PostgreSQL/Redis dependency health remain unverified.                                                                                    |
| Real UI media capture                       | Pass: Chrome captured the running Next UI at `/`, `/login`, and `/register`; ImageMagick encoded the committed GIF. This is media evidence, not browser visual QA.                                    |

## Security and environment boundaries

Never commit `.env`, API keys, database credentials, JWT secrets, private
keys, cookies, access tokens, refresh tokens, or user source code. The
committed `.env.example` contains names and empty placeholders only.

The reserved OpenAI and optional RAG/DeepSeek variable names are not an
implemented provider. The code-review path remains Luna-only by project
policy, while the optional RAG suggestion boundary is disabled and deferred
by [ADR-001](docs/architecture/adr-001-optional-rag-suggestion-provider.md).
No worker in this checkpoint makes a live AI call.

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
- No live AI provider, queue, review worker, streaming result, or generated
  finding exists at this checkpoint.
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
- No license file or package `license` field is present. Treat licensing as a
  blocker for a public package or public release until the project owner adds
  a license supported by repository evidence.
