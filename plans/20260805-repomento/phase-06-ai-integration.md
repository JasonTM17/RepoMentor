# Phase 06 — Luna AI integration and prompt safety

## Dependencies and ownership

- Depends on Phase 05.
- AI worker owns provider interfaces, Fake provider, Luna OpenAI-compatible
  provider boundary, prompt builder/versioning, schema validation, routing,
  retry/timeout, cancellation, and safe usage metadata mapping.
- Security tester owns injection fixtures and provider-boundary tests; no
  parallel edits to AI prompt/schema files.

## Accepted commit slices

- `75f05aa` — `feat(ai): add Luna review provider boundary`
- `0cae58c` — `test(ai): cover Luna boundary safety`
- `901d1fc` — `test(api): discover nested AI tests`
- `369c958` — `chore(config): document Luna runtime variables`

## Acceptance and validation

Only GPT-5.6 Luna is selectable; QUICK/STANDARD/DEEP map to low/medium/max;
source is serialized as untrusted data with collision-safe framing;
system/developer/user/schema concerns remain separated; output is validated
with bounded retry and typed errors; timeout, cancellation, endpoint allowlist,
and redirect behavior are bounded; server-only `LUNA_API_KEY` and the fixed
allowlisted `LUNA_API_BASE_URL=https://api.openai.com/v1` are the only runtime
provider settings; secrets/source are not logged; fake tests never call live
AI.

Validation on the accepted main checkpoint: 62/62 normal API tests pass,
including 22 focused AI tests; API build, lint, typecheck, Prettier, and
diff-check pass. Manager Luna and Kongming/Terra independently accepted the
exact commit chain. This proves the provider boundary only, not live provider
access or an end-to-end review result.

## Remaining review execution boundary

The review API still does not invoke the Luna provider. This phase does not
provide a live AI call, review-processing worker, persistence of a generated
result, application usage/quota accounting, SSE result streaming, connected
editor integration, registry publication, or deployment.

## Deferred optional RAG capability

The user requested DeepSeek V4 Flash for chatbot/RAG suggestions. This does
not change the Phase 06 code-review contract: agent workers, reviewers, and
the critical code-review provider remain Luna-only. Any future DeepSeek use is
a separate server-side `rag_suggestion` capability, disabled by default and
never selected by a public `provider` or `model` field.

Before enabling it, a later security/observability gate must prove strict
bounded suggestion output, tenant/project ACL-filtered citations, trust labels,
prompt-injection isolation, source redaction, retention/deletion behavior,
quota/concurrency limits, typed provider-unavailable errors, and safe logs.
An ADR/legal/privacy review must also cover provider data handling, consent,
data location, subprocessors, licensing, and cost limits. No DeepSeek secret is
added, documented, or stored in the repository, plan, prompt, or logs; local
runtime secrets must use an approved secret mechanism.
