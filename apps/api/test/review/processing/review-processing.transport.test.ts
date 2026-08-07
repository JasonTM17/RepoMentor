import assert from "node:assert/strict";
import { HttpStatus } from "@nestjs/common";
import { describe, it } from "node:test";

import { ReviewProcessingBoundaryError } from "../../../src/modules/review/processing/review-processing.errors.js";
import { mapReviewProcessingError } from "../../../src/modules/review/processing/review-processing.transport.js";

describe("review processing transport", () => {
  it("maps lock dependency failure to a generic 503", () => {
    const error = mapReviewProcessingError(
      new ReviewProcessingBoundaryError("PROCESSING_LOCK_UNAVAILABLE"),
    );

    assert.equal(error.getStatus(), HttpStatus.SERVICE_UNAVAILABLE);
    assert.equal(JSON.stringify(error.getResponse()).includes("Redis"), false);
  });
});
