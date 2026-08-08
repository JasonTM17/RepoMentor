# AI prompt design

RepoMentor's review prompt is a server-owned contract. It is not a general
provider switch and it does not grant the model execution or browsing tools.

## Fixed routing

The constants in
[`apps/api/src/modules/ai/ai.types.ts`](../apps/api/src/modules/ai/ai.types.ts)
define:

```text
provider: luna
model: gpt-5.6-luna
prompt version: v1
reasoning efforts: low, medium, max
```

Review mode maps to reasoning effort in
[`ai.policy.ts`](../apps/api/src/modules/ai/ai.policy.ts): `QUICK` → `low`,
`STANDARD` → `medium`, and `DEEP` → `max`. Public requests do not provide any
of these routing values. The processing controller requires an empty body and
selects the server-owned provider boundary.

The HTTP adapter is
[`luna-openai.provider.ts`](../apps/api/src/modules/ai/luna-openai.provider.ts).
It accepts only the deployment-owned HTTPS base URL, sends the server-only
`LUNA_API_KEY`, uses the Responses endpoint, sets `store: false`, and returns
typed errors for authentication, rate limits, timeouts, unavailable services,
malformed output, refusal, and cancellation.

## Prompt layers

[`review-prompt.builder.ts`](../apps/api/src/modules/ai/review-prompt.builder.ts)
builds a versioned request with three layers:

1. **System** — identifies the defensive review role, fixes the Luna boundary,
   treats every source byte as data, forbids hidden-policy disclosure, code
   execution, tools, browsing, fetching, installation, and file changes.
2. **Developer** — names the output schema, requires evidence-based bounded
   findings, defines the education/diff/test-question rules, and states that
   generated tests are suggestions and must never be executed.
3. **User** — supplies bounded language/mode metadata and a JSON-serialized
   source/metadata block marked as untrusted data.

Source and metadata are encoded as JSON strings and `<`/`>` are escaped so the
framing markers cannot be recreated by input data. Titles, context, filenames,
comments, strings, markup, delimiters, and retrieved text are data, not control
instructions. The model must ignore directives inside them.

## Output contract

The provider requests the strict JSON schema named by
[`review-result.schema.ts`](../apps/api/src/modules/ai/review-result.schema.ts).
Application policy bounds source, prompt, response bytes, findings, summary,
paths, line numbers, improved source, diff, generated tests, and learning
questions. The review service validates the result locally and may perform a
bounded repair attempt; it never executes generated tests or improved source.

Persisted result metadata records the fixed provider/model, reasoning effort,
attempt count, duration, and validated result/usage. Provider bodies, prompts,
source payloads, credentials, and hidden policy are not returned as telemetry.

## Testing and deferred RAG

AI unit tests use fake providers and deterministic responses to verify policy,
prompt framing, schema validation, retry, cancellation, and error mapping. No
external Luna HTTP call is made by the deterministic suite, so passing tests do
not prove provider availability, model behavior, billing, or production
latency.

The optional chatbot/RAG suggestion idea is intentionally separate from review
routing. It is disabled by default and governed by
[ADR-001](architecture/adr-001-optional-rag-suggestion-provider.md). No
DeepSeek credential or provider fallback is configured in this checkpoint.
