# RepoMentor

RepoMentor is a production-oriented monorepo for an AI code-review and
programming-tutor platform. The product will accept source code as untrusted
data, return structured explanations and review findings, and provide a safe
learning workflow around those results.

## Project status

Phase 01 establishes the repository foundation only. There is no web
application, API, database schema, Docker environment, or AI integration in
this checkout yet, so this repository is not production-ready.

## Foundation stack

The current foundation was validated with:

| Tool       | Version or policy                                                                         |
| ---------- | ----------------------------------------------------------------------------------------- |
| Node.js    | `v24.12.0` validation runtime; project policy is `>=22.0.0`                               |
| pnpm       | `11.0.9` via `packageManager`                                                             |
| Turbo      | `2.10.8`                                                                                  |
| TypeScript | `6.0.3`; selected because the current shared ESLint parser declares support below `6.1.0` |
| ESLint     | `10.8.0`                                                                                  |
| Prettier   | `3.9.6`                                                                                   |

Next.js, NestJS, Prisma, PostgreSQL, Redis, and the OpenAI SDK are intentionally
reserved for later phases.

## Repository layout

Current configuration packages and future seams are organized as follows:

```text
.
├── packages/
│   ├── eslint-config/       # Shared flat ESLint configuration
│   └── typescript-config/   # Strict base, Node, and Next.js presets
├── apps/
│   ├── api/                 # Planned NestJS application
│   └── web/                 # Planned Next.js application
├── prisma/                  # Planned database schema and migrations
├── .env.example             # Variable names only; no credentials or defaults
├── package.json             # Workspace commands and tool versions
├── pnpm-workspace.yaml      # apps/* and packages/* workspace boundaries
└── turbo.json               # Future task graph and cache boundaries
```

The `apps/` and `prisma/` paths are documented seams, not implemented code in
this phase.

## Local setup

Prerequisites are Node.js 22 or newer and pnpm 11. Corepack can select the
package-manager version recorded in `package.json`:

```bash
corepack enable
pnpm install --frozen-lockfile
```

For local configuration, copy `.env.example` to an untracked `.env` file and
populate values only when a later phase requires them. The committed template
contains blank variable names and `.env` files are ignored by Git.

## Commands

| Command             | Purpose                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `pnpm install`      | Install the locked workspace dependencies                          |
| `pnpm run install`  | Explicit frozen-lockfile install with lifecycle scripts disabled   |
| `pnpm dev`          | Run present workspace `dev` scripts                                |
| `pnpm lint`         | Lint the root configuration, then present workspace `lint` scripts |
| `pnpm typecheck`    | Run present workspace `typecheck` scripts                          |
| `pnpm test`         | Run present workspace `test` scripts                               |
| `pnpm build`        | Run present workspace `build` scripts                              |
| `pnpm format`       | Format supported repository files with Prettier                    |
| `pnpm format:check` | Verify Prettier formatting without writing                         |

The root workspace commands use pnpm's recursive `--if-present` strategy while
the workspace has no application packages. They therefore do not fabricate
passing app tasks; once a package exists, its own script is discovered and
executed. `turbo.json` defines the dependency and output graph for the
application phases that follow.

## Shared configuration

Web packages should extend the Next.js preset:

```json
{
  "extends": "@repomentor/typescript-config/nextjs.json"
}
```

Node packages, including the future API, should extend the Node preset:

```json
{
  "extends": "@repomentor/typescript-config/node.json"
}
```

Each package can consume the shared flat ESLint config from its own
`eslint.config.mjs`:

```js
import sharedConfig from "@repomentor/eslint-config";

export default sharedConfig;
```

The TypeScript base preset enables strict checking and additional safety
options such as exact optional properties and unchecked indexed access. The
shared ESLint config combines recommended JavaScript and TypeScript rules with
Prettier's conflicting-rule protection.

## Environment and security

`.env.example` is the authoritative list of planned variable names. It does
not contain real environment values. Never commit `.env`, API keys, database
credentials, JWT secrets, private keys, or user source code.

Later application phases must keep OpenAI calls server-side, treat submitted
source code as untrusted input, validate model output, and never execute user
source code. Those controls are not implemented by the foundation alone.

## Validation and contribution rules

Before each focused commit, inspect status and the staged diff, run
`git diff --cached --check`, perform a redacted secret-like scan, and run the
narrowest useful checks followed by lint, typecheck, test, build, and
`pnpm format:check` when the change affects shared configuration.

Use concise Conventional Commits such as
`chore(config): add shared TypeScript and ESLint configuration`. Stage explicit
paths and keep coordinator plans, local AgentKit/Claude tooling, and unrelated
worktree changes out of product commits.

## Roadmap

The next phase is application scaffolding: add the Next.js web app, NestJS API,
shared contract seams, and initial health endpoints. Subsequent phases will
introduce local PostgreSQL/Redis infrastructure, authentication, review
persistence, Luna provider isolation, streaming, UI workflows, security
hardening, observability, tests, Docker, and CI.

## Known limitations

- No application runtime or user-facing feature is implemented yet.
- No live PostgreSQL, Redis, OpenAI, deployment, or external credential checks
  are available in this foundation phase.
- The blank environment template defines future seams but does not configure
  local services by itself.
