import assert from "node:assert/strict";
import test from "node:test";

import * as contracts from "../src/index.js";

test("the contracts package entrypoint is loadable", () => {
  assert.equal(typeof contracts, "object");
});
