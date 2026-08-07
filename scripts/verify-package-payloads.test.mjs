import assert from "node:assert/strict";
import test from "node:test";

import { redactDiagnostics } from "./verify-package-payloads.mjs";

test("redacts quoted JSON and key-value secret fields while preserving context", () => {
  const values = [
    "json-token-value with spaces",
    "single-quoted-password value",
    "api-key-value,with punctuation",
  ];
  const diagnostics = [
    `failure: {"token":"${values[0]}","detail":"retain-json-context"}`,
    `config password = '${values[1]}' and detail=retain-key-value-context`,
    `api_key: "${values[2]}"`,
  ].join("\n");

  const redacted = redactDiagnostics(diagnostics);

  for (const value of values) {
    assert.equal(redacted.includes(value), false);
  }
  assert.match(redacted, /"token":"\[REDACTED\]","detail":"retain-json-context"/u);
  assert.match(redacted, /password = '\[REDACTED\]' and detail=retain-key-value-context/u);
  assert.match(redacted, /api_key: "\[REDACTED\]"/u);
});

test("redacts quoted and unquoted Authorization Bearer credentials", () => {
  const credentials = [
    "bearer-header-value-123",
    "bearer-json-value-456",
    "generic-bearer-value-789",
  ];
  const diagnostics = [
    `Authorization: Bearer ${credentials[0]}`,
    `headers={"Authorization":"Bearer ${credentials[1]}","requestId":"req-123"}`,
    `provider failure: Bearer ${credentials[2]}`,
  ].join("\n");

  const redacted = redactDiagnostics(diagnostics);

  for (const credential of credentials) {
    assert.equal(redacted.includes(credential), false);
  }
  assert.match(redacted, /Authorization: Bearer \[REDACTED\]/u);
  assert.match(redacted, /"Authorization":"Bearer \[REDACTED\]","requestId":"req-123"/u);
  assert.match(redacted, /provider failure: Bearer \[REDACTED\]/u);
});

test("keeps diagnostics bounded to the final twelve non-empty lines", () => {
  const diagnostics = [
    "",
    ...Array.from({ length: 14 }, (_value, index) => `context-${index}`),
  ].join("\n");

  const redacted = redactDiagnostics(diagnostics);

  assert.equal(redacted.split("\n").length, 12);
  assert.doesNotMatch(redacted, /^context-0$/mu);
  assert.doesNotMatch(redacted, /^context-1$/mu);
  assert.match(redacted, /context-2\ncontext-3/u);
  assert.match(redacted, /context-13$/u);
});
