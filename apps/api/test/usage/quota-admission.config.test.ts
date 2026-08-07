import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseQuotaAdmissionFingerprintConfig,
  QUOTA_ADMISSION_FINGERPRINT_ENV_NAMES,
  QuotaAdmissionFingerprintConfigError,
} from "../../src/modules/usage/quota-admission.config.js";
import {
  QUOTA_ADMISSION_FINGERPRINT_MAX_SECRET_BYTES,
  QUOTA_ADMISSION_FINGERPRINT_MIN_SECRET_BYTES,
} from "../../src/modules/usage/quota-admission.fingerprint.js";

const TEST_SECRET = "quota-admission-test-secret-with-at-least-32-bytes";

function expectConfigError(action: () => unknown, forbiddenValues: readonly string[] = []): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof QuotaAdmissionFingerprintConfigError);
    assert.deepEqual(error.variableNames, [QUOTA_ADMISSION_FINGERPRINT_ENV_NAMES.SECRET]);

    for (const forbiddenValue of forbiddenValues) {
      assert.equal(error.message.includes(forbiddenValue), false);
      assert.equal(error.stack?.includes(forbiddenValue), false);
    }

    return true;
  });
}

describe("quota admission fingerprint configuration", () => {
  it("reads and preserves the configured UTF-8 secret", () => {
    const secret = `${"é".repeat(16)}-quota-admission`;
    const minimumSecret = "s".repeat(QUOTA_ADMISSION_FINGERPRINT_MIN_SECRET_BYTES);
    const maximumSecret = "s".repeat(QUOTA_ADMISSION_FINGERPRINT_MAX_SECRET_BYTES);

    assert.equal(
      Buffer.byteLength(secret, "utf8") >= QUOTA_ADMISSION_FINGERPRINT_MIN_SECRET_BYTES,
      true,
    );
    assert.equal(
      parseQuotaAdmissionFingerprintConfig({
        NODE_ENV: "production",
        [QUOTA_ADMISSION_FINGERPRINT_ENV_NAMES.SECRET]: secret,
      }).fingerprintSecret,
      secret,
    );
    assert.equal(
      parseQuotaAdmissionFingerprintConfig({
        NODE_ENV: "development",
        [QUOTA_ADMISSION_FINGERPRINT_ENV_NAMES.SECRET]: minimumSecret,
      }).fingerprintSecret,
      minimumSecret,
    );
    assert.equal(
      parseQuotaAdmissionFingerprintConfig({
        NODE_ENV: "production",
        [QUOTA_ADMISSION_FINGERPRINT_ENV_NAMES.SECRET]: maximumSecret,
      }).fingerprintSecret,
      maximumSecret,
    );
  });

  it("fails closed when development or production configuration is missing", () => {
    for (const nodeEnv of ["development", "production"] as const) {
      expectConfigError(() => parseQuotaAdmissionFingerprintConfig({ NODE_ENV: nodeEnv }));
    }
  });

  it("rejects secrets outside the inclusive UTF-8 byte bounds without echoing them", () => {
    const tooShort = "s".repeat(QUOTA_ADMISSION_FINGERPRINT_MIN_SECRET_BYTES - 1);
    const tooLong = "s".repeat(QUOTA_ADMISSION_FINGERPRINT_MAX_SECRET_BYTES + 1);

    for (const secret of [tooShort, tooLong]) {
      expectConfigError(
        () =>
          parseQuotaAdmissionFingerprintConfig({
            NODE_ENV: "production",
            [QUOTA_ADMISSION_FINGERPRINT_ENV_NAMES.SECRET]: secret,
          }),
        [secret],
      );
    }
  });

  it("supports an explicit test-only secret injection", () => {
    assert.deepEqual(
      parseQuotaAdmissionFingerprintConfig({ NODE_ENV: "test" }, { testSecret: TEST_SECRET }),
      { fingerprintSecret: TEST_SECRET },
    );
  });

  it("rejects test injection outside test runtime without exposing the secret", () => {
    expectConfigError(
      () =>
        parseQuotaAdmissionFingerprintConfig(
          { NODE_ENV: "production" },
          { testSecret: TEST_SECRET },
        ),
      [TEST_SECRET],
    );
  });

  it("also accepts an explicitly configured test environment secret", () => {
    assert.equal(
      parseQuotaAdmissionFingerprintConfig({
        NODE_ENV: "test",
        [QUOTA_ADMISSION_FINGERPRINT_ENV_NAMES.SECRET]: TEST_SECRET,
      }).fingerprintSecret,
      TEST_SECRET,
    );
  });
});
