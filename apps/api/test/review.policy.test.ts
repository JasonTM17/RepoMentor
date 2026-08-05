import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allowedSourceStatuses,
  canTransition,
  reviewTransitions,
} from "../src/modules/review/review.policy.js";

describe("review status policy", () => {
  it("keeps the five persisted statuses explicit", () => {
    assert.deepEqual(Object.keys(reviewTransitions()).sort(), [
      "CANCELLED",
      "COMPLETED",
      "FAILED",
      "PENDING",
      "PROCESSING",
    ]);
  });

  it("allows only bounded lifecycle transitions", () => {
    assert.equal(canTransition("PENDING", "PROCESSING"), true);
    assert.equal(canTransition("PROCESSING", "COMPLETED"), true);
    assert.equal(canTransition("PROCESSING", "FAILED"), true);
    assert.equal(canTransition("PROCESSING", "CANCELLED"), true);
    assert.equal(canTransition("FAILED", "PENDING"), true);
    assert.equal(canTransition("CANCELLED", "PENDING"), true);
    assert.equal(canTransition("COMPLETED", "PENDING"), false);
    assert.equal(canTransition("PENDING", "COMPLETED"), false);
    assert.deepEqual([...allowedSourceStatuses("CANCELLED")].sort(), ["PENDING", "PROCESSING"]);
    assert.deepEqual([...allowedSourceStatuses("PENDING")].sort(), ["CANCELLED", "FAILED"]);
  });
});
