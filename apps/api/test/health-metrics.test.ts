import assert from "node:assert/strict";
import test from "node:test";

import { metricsHealthPayloadSchema } from "@repomentor/contracts";

import { HealthMetricsService } from "../src/modules/health/health.metrics.js";

test("tracks aggregate request counters without route or payload labels", () => {
  const metrics = new HealthMetricsService();

  metrics.recordRequestStarted();
  metrics.recordRequestStarted();
  metrics.recordRequestFinished(200);
  metrics.recordRequestFinished(404);
  metrics.recordRequestFinished(503);

  const snapshot = metrics.getMetrics();

  assert.deepEqual(snapshot, {
    scope: "application",
    requests: {
      total: 2,
      inFlight: 0,
      completed: 3,
      clientErrors: 1,
      serverErrors: 1,
    },
  });
  assert.equal(metricsHealthPayloadSchema.safeParse(snapshot).success, true);
});

test("never lets an unmatched completion produce a negative in-flight count", () => {
  const metrics = new HealthMetricsService();

  metrics.recordRequestFinished(204);

  assert.equal(metrics.getMetrics().requests.inFlight, 0);
});
