# Phase 01 — Monorepo foundation

## Dependencies and ownership

- Depends on Phase 00.
- One foundation worker owns root manifests, lockfile, Turbo, configs, ignore
  rules, env example, and initial README.
- No parallel edits to root config or lockfile.

## Commit slices

- `chore(repo): initialize pnpm monorepo`
- `chore(config): add shared TypeScript and ESLint configuration`
- `chore(config): add formatting and environment conventions`
- `docs(readme): add initial project documentation`

## Acceptance and validation

- Strict TypeScript, lint, format, and workspace commands are reproducible.
- `pnpm install --frozen-lockfile` (after lockfile exists), `pnpm lint`,
  `pnpm typecheck`, and `pnpm build` pass for the empty workspace.
- `.env.example` contains names only; `.env*` secrets are ignored.

## Handoff

Record exact manifest versions, command output, and the next clean base SHA.
