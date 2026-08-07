import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveGuestIdentity,
  GuestIdentityUnavailableError,
} from "../../src/modules/guest/guest.identity.js";

const validSecret = "guest-identity-fixture-value-0123456789abcdef";

describe("guest identity derivation", () => {
  it("is stable for one socket address and different for another", () => {
    const first = deriveGuestIdentity("192.0.2.10", validSecret);
    const repeated = deriveGuestIdentity("192.0.2.10", validSecret);
    const different = deriveGuestIdentity("192.0.2.11", validSecret);

    assert.match(first, /^[a-f0-9]{64}$/u);
    assert.equal(first, repeated);
    assert.notEqual(first, different);
    assert.equal(first.includes("192.0.2.10"), false);
    assert.equal(different.includes("192.0.2.11"), false);
  });

  it("rejects missing or unusable address and secret without echoing them", () => {
    const cases = [
      { address: undefined, secret: validSecret, forbidden: "192.0.2.10" },
      { address: "not-an-ip", secret: validSecret, forbidden: "not-an-ip" },
      { address: "192.0.2.10", secret: undefined, forbidden: "192.0.2.10" },
      { address: "192.0.2.10", secret: "short", forbidden: "short" },
    ] as const;

    for (const testCase of cases) {
      assert.throws(
        () => deriveGuestIdentity(testCase.address, testCase.secret),
        (error: unknown) => {
          assert.ok(error instanceof GuestIdentityUnavailableError);
          assert.equal(error.message.includes(testCase.forbidden), false);
          return true;
        },
      );
    }
  });
});
