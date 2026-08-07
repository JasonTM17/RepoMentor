import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeQuotaAdmissionFingerprint,
  QUOTA_ADMISSION_FINGERPRINT_MAX_LANGUAGE_LENGTH,
  QUOTA_ADMISSION_FINGERPRINT_MAX_SECRET_BYTES,
  QUOTA_ADMISSION_FINGERPRINT_MAX_SOURCE_LENGTH,
  QUOTA_ADMISSION_FINGERPRINT_VERSION,
  QuotaAdmissionFingerprintInputError,
  resolveQuotaAdmissionReviewMode,
  type QuotaAdmissionFingerprintInput,
} from "../../src/modules/usage/quota-admission.fingerprint.js";

const SECRET = "admission-fingerprint-secret-with-at-least-32-bytes";
const OTHER_SECRET = "different-admission-fingerprint-secret-32-bytes";

function input(
  overrides: Partial<QuotaAdmissionFingerprintInput> = {},
): QuotaAdmissionFingerprintInput {
  return {
    fingerprintVersion: QUOTA_ADMISSION_FINGERPRINT_VERSION,
    language: "TypeScript",
    mode: "STANDARD",
    source: "const answer = 42;\n",
    ...overrides,
  };
}

function assertInvalid(action: () => unknown, rawMaterial: readonly string[]): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof QuotaAdmissionFingerprintInputError);
    assert.equal(error.message, "Quota admission fingerprint input is invalid.");
    assert.equal(error.stack?.includes("Quota admission fingerprint input is invalid."), true);
    for (const value of rawMaterial) {
      assert.equal(error.message.includes(value), false);
      assert.equal(error.stack?.includes(value), false);
    }
    return true;
  });
}

describe("quota admission fingerprint", () => {
  it("is deterministic and returns only a lowercase hash plus its explicit version", () => {
    const first = computeQuotaAdmissionFingerprint(SECRET, input());
    const second = computeQuotaAdmissionFingerprint(SECRET, input());

    assert.deepEqual(first, second);
    assert.deepEqual(Object.keys(first).sort(), ["fingerprintVersion", "requestFingerprintHash"]);
    assert.equal(first.fingerprintVersion, QUOTA_ADMISSION_FINGERPRINT_VERSION);
    assert.match(first.requestFingerprintHash, /^[a-f0-9]{64}$/u);
  });

  it("separates source, normalized language, mode, and fingerprint version", () => {
    const baseline = computeQuotaAdmissionFingerprint(SECRET, input());

    for (const changed of [
      input({ source: "const answer = 43;\n" }),
      input({ language: "JavaScript" }),
      input({ mode: "QUICK" }),
      input({ fingerprintVersion: QUOTA_ADMISSION_FINGERPRINT_VERSION + 1 }),
    ]) {
      const result = computeQuotaAdmissionFingerprint(SECRET, changed);
      assert.notEqual(result.requestFingerprintHash, baseline.requestFingerprintHash);
    }
  });

  it("preserves source Unicode and line endings while normalizing language", () => {
    const composedSource = "const café = 1;\r\n";
    const decomposedSource = "const cafe\u0301 = 1;\r\n";
    const composed = computeQuotaAdmissionFingerprint(SECRET, input({ source: composedSource }));
    const decomposed = computeQuotaAdmissionFingerprint(
      SECRET,
      input({ source: decomposedSource }),
    );
    const lf = computeQuotaAdmissionFingerprint(
      SECRET,
      input({ source: composedSource.replaceAll("\r\n", "\n") }),
    );

    assert.notEqual(composed.requestFingerprintHash, decomposed.requestFingerprintHash);
    assert.notEqual(composed.requestFingerprintHash, lf.requestFingerprintHash);

    const languageComposed = computeQuotaAdmissionFingerprint(
      SECRET,
      input({ language: "  CAFÉ  " }),
    );
    const languageDecomposed = computeQuotaAdmissionFingerprint(
      SECRET,
      input({ language: "cafe\u0301" }),
    );
    assert.equal(
      languageComposed.requestFingerprintHash,
      languageDecomposed.requestFingerprintHash,
    );
  });

  it("changes when the injected secret changes", () => {
    const first = computeQuotaAdmissionFingerprint(SECRET, input());
    const second = computeQuotaAdmissionFingerprint(OTHER_SECRET, input());

    assert.notEqual(first.requestFingerprintHash, second.requestFingerprintHash);
  });

  it("resolves the default mode only through the explicit helper", () => {
    assert.equal(resolveQuotaAdmissionReviewMode(), "STANDARD");
    assert.equal(resolveQuotaAdmissionReviewMode("QUICK"), "QUICK");
    assert.equal(resolveQuotaAdmissionReviewMode("DEEP"), "DEEP");
    assertInvalid(() => resolveQuotaAdmissionReviewMode("quick"), ["quick"]);
  });

  it("rejects malformed and bounded inputs without exposing raw material", () => {
    const secretMaterial = "secret-material-that-must-not-appear";
    const sourceMaterial = "source-material-that-must-not-appear";
    const keyMaterial = "key-material-that-must-not-appear";

    assertInvalid(() => computeQuotaAdmissionFingerprint("short", input()), ["short"]);
    assertInvalid(() => computeQuotaAdmissionFingerprint(undefined, input()), [secretMaterial]);
    assertInvalid(
      () =>
        computeQuotaAdmissionFingerprint(
          "s".repeat(QUOTA_ADMISSION_FINGERPRINT_MAX_SECRET_BYTES + 1),
          input(),
        ),
      ["s".repeat(QUOTA_ADMISSION_FINGERPRINT_MAX_SECRET_BYTES + 1)],
    );
    assertInvalid(
      () =>
        computeQuotaAdmissionFingerprint(SECRET, {
          ...input(),
          source: `${sourceMaterial}${"x".repeat(QUOTA_ADMISSION_FINGERPRINT_MAX_SOURCE_LENGTH)}`,
        }),
      [sourceMaterial],
    );
    assertInvalid(
      () =>
        computeQuotaAdmissionFingerprint(SECRET, {
          ...input(),
          language: `${keyMaterial}${"x".repeat(QUOTA_ADMISSION_FINGERPRINT_MAX_LANGUAGE_LENGTH)}`,
        }),
      [keyMaterial],
    );
    assertInvalid(
      () => computeQuotaAdmissionFingerprint(SECRET, { ...input(), mode: "quick" as never }),
      ["quick"],
    );
    assertInvalid(
      () => computeQuotaAdmissionFingerprint(SECRET, { ...input(), fingerprintVersion: 1.5 }),
      ["1.5"],
    );
    assertInvalid(
      () =>
        computeQuotaAdmissionFingerprint(SECRET, {
          ...input(),
          fingerprintVersion: Number.MAX_SAFE_INTEGER,
        }),
      [String(Number.MAX_SAFE_INTEGER)],
    );
  });
});
