import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GUEST_IDENTITY_SECRET_ENV_NAME,
  resolveGuestIdentityConfig,
} from "../../src/modules/guest/guest.config.js";

const validSecret = "guest-identity-fixture-value-0123456789abcdef";

describe("guest identity configuration", () => {
  it("keeps test bootstrap available when the secret is missing", () => {
    assert.deepEqual(resolveGuestIdentityConfig({ NODE_ENV: "test" }), {
      secret: undefined,
    });
  });

  it("accepts a bounded secret without exposing it in errors", () => {
    const config = resolveGuestIdentityConfig({
      [GUEST_IDENTITY_SECRET_ENV_NAME]: `  ${validSecret}  `,
    });

    assert.deepEqual(config, { secret: validSecret });
  });

  it("fails closed for empty, short, and oversized secrets", () => {
    for (const value of ["", "short", "x".repeat(4_097)]) {
      assert.deepEqual(resolveGuestIdentityConfig({ [GUEST_IDENTITY_SECRET_ENV_NAME]: value }), {
        secret: undefined,
      });
    }
  });
});
