# Phase 02 — Application scaffolding

## Dependencies and ownership

- Depends on Phase 01.
- Web worker owns `apps/web/**`; API worker owns `apps/api/**`.
- Coordinator owns shared package wiring and root config, sequenced after both
  workers if required.
- The web worker follows `ak:frontend-design` plus
  `ak:frontend-development` (the installed equivalent of the requested
  `ak-fe` route). The UI foundation must include a recorded Design Read,
  seeded aesthetic direction, token-first styling, complete interaction
  states, responsive/accessibility checks, and a visual-QA result.
- `packages/contracts/**` has one sequenced owner after the app scaffolds are
  accepted. It contains transport-only schemas and inferred types, not domain
  models or framework decorators.

## Commit slices

- `chore(web): initialize Next.js application`
- `chore(api): initialize NestJS application`
- `feat(api): add application health endpoints`
- `feat(contracts): add initial API response contracts`
- `feat(web): establish RepoMentor design foundation`

## Acceptance and validation

Web and API boot independently; strict typecheck and production build pass;
health live/ready routes do not expose secrets; Swagger bootstrap is present;
shared imports have no circular dependency. The web foundation also passes the
frontend self-review gate at 375px and desktop widths, has keyboard-visible
focus and reduced-motion handling, and does not use emoji as structural icons.
