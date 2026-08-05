# Phase 02 — Application scaffolding

## Dependencies and ownership

- Depends on Phase 01.
- Web worker owns `apps/web/**`; API worker owns `apps/api/**`.
- Coordinator owns shared package wiring and root config, sequenced after both
  workers if required.

## Commit slices

- `chore(web): initialize Next.js application`
- `chore(api): initialize NestJS application`
- `feat(api): add application health endpoints`
- `feat(contracts): add initial API response contracts`

## Acceptance and validation

Web and API boot independently; strict typecheck and production build pass;
health live/ready routes do not expose secrets; Swagger bootstrap is present;
shared imports have no circular dependency.
