import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AuthRateLimiter,
  MAX_AUTH_RATE_LIMIT_BUCKETS,
} from "../src/modules/auth/auth-rate-limiter.js";

const policies = {
  login: { limit: 2, windowMs: 1_000 },
  refresh: { limit: 3, windowMs: 1_000 },
  register: { limit: 2, windowMs: 1_000 },
} as const;

describe("authentication rate limiter", () => {
  it("limits both the IP and identity within a deterministic window", () => {
    const limiter = new AuthRateLimiter(policies);

    assert.equal(limiter.consume("login", ["ip:one", "email:one@example.com"], 0).allowed, true);
    assert.equal(limiter.consume("login", ["ip:one", "email:one@example.com"], 100).allowed, true);
    const blocked = limiter.consume("login", ["ip:one", "email:one@example.com"], 200);

    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.equal(blocked.retryAfterSeconds, 1);
    assert.equal(
      limiter.consume("login", ["ip:one", "email:one@example.com"], 1_000).allowed,
      true,
    );
  });

  it("bounds retained local buckets", () => {
    const limiter = new AuthRateLimiter(policies);

    for (let index = 0; index < MAX_AUTH_RATE_LIMIT_BUCKETS + 25; index += 1) {
      limiter.consume("refresh", [`ip:${index}`], index);
    }

    assert.ok(limiter.size <= MAX_AUTH_RATE_LIMIT_BUCKETS);
  });
});
