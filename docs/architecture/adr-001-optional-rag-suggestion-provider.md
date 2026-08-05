# ADR-001: Optional RAG suggestion provider boundary

- Status: accepted as a deferred design
- Date: 2026-08-05
- Owners: RepoMentor coordinator and Luna manager

## Context

RepoMentor's critical product path is authenticated code review. The delivery
contract requires GPT-5.6 Luna for code-review routing and for every project
worker, tester, reviewer, and manager. The user also requested DeepSeek V4
Flash for a possible chatbot/RAG suggestion experience.

These capabilities have different trust, privacy, and correctness contracts.
Treating a user-supplied provider/model value as a generic switch would allow
the review path to bypass its Luna-only policy and would make data handling
ambiguous.

## Decision

Keep the code-review provider capability Luna-only. If RAG suggestions are
implemented, expose them as a separate server-side capability named
`rag_suggestion`, with DeepSeek V4 Flash as an optional, disabled-by-default
adapter behind a server-controlled feature flag. Public requests must not
choose a provider or model, and failures must return a typed unavailable
result rather than silently resubmitting content to another provider.

The future suggestion boundary must:

- accept only bounded, schema-validated output with citations restricted to
  retrieved chunk IDs;
- filter retrieval by tenant/project ownership before generation and attach
  source-version and trust metadata;
- delimit user chat, source, retrieved text, and tool output as untrusted data;
- perform best-effort secret redaction before external transmission;
- prohibit shell, tool execution, browsing, and cross-tenant caches in the
  first release;
- use server-side timeout, concurrency, quota, retention, and deletion rules;
- log only safe identifiers, provider aliases, sizes, latency, and aggregate
  usage—not prompts, source, provider bodies, cookies, auth headers, or keys.

The API key supplied in conversation is not persisted or copied into product
files. Runtime credentials must be rotated and provided through an approved
local/deployment secret mechanism. `.env.example` may contain names and empty
placeholders only.

## Consequences

Phase 06 can complete its Luna-only review provider and prompt-safety gates
without a live DeepSeek dependency. RAG suggestions require a later bounded
phase plus security, observability, privacy/legal, and cost approvals. This
adds a capability boundary and some configuration work, but prevents silent
provider substitution, cross-tenant retrieval, raw secret leakage, and
unverifiable production claims.
