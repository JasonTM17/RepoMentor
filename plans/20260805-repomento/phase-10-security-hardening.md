# Phase 10 — Security hardening

## Dependencies and ownership

- Depends on Phase 09.
- Security worker owns headers, CORS/CSRF decision, request limits, sanitizing,
  redaction, audit events, dependency audit fixes, and security documentation.
- Do not change auth or AI behavior without targeted regression tests.

## Commit slices

- `fix(security): harden API security headers and CORS`
- `fix(security): add request size and rate limits`
- `fix(security): sanitize AI-generated markdown output`
- `feat(audit): record sensitive user actions`
- `test(security): add authorization boundary tests`
- `docs(security): document threat model and mitigations`

## Acceptance and validation

Helmet/CSP/secure cookies/CORS/request limits are explicit; HTML and links from
AI output are sanitized; auth headers/cookies/API keys/raw source are redacted;
ownership and prompt-injection boundaries have negative tests; dependencies are
audited without hiding findings.
