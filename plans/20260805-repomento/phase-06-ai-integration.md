# Phase 06 — Luna AI integration and prompt safety

## Dependencies and ownership

- Depends on Phase 05.
- AI worker owns provider interfaces, Fake provider, OpenAI provider, prompt
  builder/versioning, schema validation, routing, retry/timeout, usage mapping.
- Security tester owns injection fixtures and provider-boundary tests; no
  parallel edits to AI prompt/schema files.

## Commit slices

- `feat(ai): add AI review provider abstraction`
- `test(ai): add deterministic fake AI provider`
- `feat(ai): add Luna Responses API provider`
- `feat(ai): add versioned code review prompt builder`
- `feat(ai): enforce structured review output validation`
- `feat(ai): add review mode model routing`
- `feat(usage): record AI usage and request duration`
- `fix(security): isolate untrusted source code from AI instructions`
- `test(security): add prompt injection resistance tests`

## Acceptance and validation

Only GPT-5.6 Luna is selectable; QUICK/STANDARD/DEEP map to low/medium/max;
source is delimited as untrusted data; system/developer/user/schema concerns
remain separated; output is validated with bounded retry and typed errors;
secrets/source are not logged; fake tests never call live AI.
