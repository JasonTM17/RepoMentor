import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseUsageQuotaConfig,
  USAGE_DEFAULT_DAILY_LIMITS,
  USAGE_MAX_DAILY_LIMIT,
  USAGE_QUOTA_ENV_NAMES,
  UsageConfigError,
} from "../../src/modules/usage/usage.config.js";
import { getUtcDayWindow, parseStrictUtcDateTime } from "../../src/modules/usage/usage.date.js";
import {
  toUsageHistoryItem,
  toUsageQuota,
  toUsageSummary,
} from "../../src/modules/usage/usage.read-model.js";
import type {
  UsageHistoryRecord,
  UsageSummaryAggregate,
} from "../../src/modules/usage/usage.types.js";

const AS_OF = new Date("2026-08-06T23:59:59.999Z");

describe("usage configuration", () => {
  it("uses the explicit authenticated-user defaults", () => {
    assert.deepEqual(parseUsageQuotaConfig({ NODE_ENV: "test" }).dailyLimits, {
      ...USAGE_DEFAULT_DAILY_LIMITS,
    });
  });

  it("accepts bounded integer overrides and rejects unsafe values without echoing them", () => {
    const environment = {
      [USAGE_QUOTA_ENV_NAMES.DEEP]: "0",
      [USAGE_QUOTA_ENV_NAMES.QUICK]: " 25 ",
      [USAGE_QUOTA_ENV_NAMES.STANDARD]: "100000",
    };

    assert.deepEqual(parseUsageQuotaConfig(environment).dailyLimits, {
      DEEP: 0,
      QUICK: 25,
      STANDARD: USAGE_MAX_DAILY_LIMIT,
    });

    for (const invalidValue of ["", "-1", "1.5", "1e2", "100001"]) {
      assert.throws(
        () =>
          parseUsageQuotaConfig({
            [USAGE_QUOTA_ENV_NAMES.QUICK]: invalidValue,
          }),
        (error: unknown) => {
          assert.ok(error instanceof UsageConfigError);
          assert.deepEqual(error.variableNames, [USAGE_QUOTA_ENV_NAMES.QUICK]);
          if (invalidValue !== "") {
            assert.equal(error.message.includes(invalidValue), false);
          }
          return true;
        },
      );
    }
  });
});

describe("usage UTC read model", () => {
  it("accepts strict UTC date-times and rejects ambiguous or invalid calendars", () => {
    const parsed = parseStrictUtcDateTime("2026-08-06T12:34:56.789Z");

    assert.equal(parsed?.toISOString(), "2026-08-06T12:34:56.789Z");
    for (const invalid of [
      "2026-08-06",
      "2026-08-06T12:34:56.789+00:00",
      "2026-02-30T00:00:00.000Z",
      "2026-08-06T24:00:00.000Z",
      "2026-08-06T12:34:60.000Z",
    ]) {
      assert.equal(parseStrictUtcDateTime(invalid), undefined, invalid);
    }
  });

  it("uses an inclusive start and exclusive next-midnight UTC window", () => {
    const window = getUtcDayWindow(AS_OF);

    assert.equal(window.day, "2026-08-06");
    assert.equal(window.start.toISOString(), "2026-08-06T00:00:00.000Z");
    assert.equal(window.endExclusive.toISOString(), "2026-08-07T00:00:00.000Z");
  });

  it("returns a truthful empty summary and all safe status keys", () => {
    const summary = toUsageSummary(
      {
        completedReviews: 0,
        deepReviews: 0,
        languageCounts: [],
        statusCounts: [],
        tokenTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        totalReviews: 0,
      },
      AS_OF,
    );

    assert.deepEqual(summary, {
      asOf: AS_OF.toISOString(),
      completedReviews: 0,
      deepReviews: 0,
      inputTokens: 0,
      languageDistribution: [],
      outputTokens: 0,
      reviewsByStatus: {
        CANCELLED: 0,
        COMPLETED: 0,
        FAILED: 0,
        PENDING: 0,
        PROCESSING: 0,
      },
      totalReviews: 0,
      totalTokens: 0,
    });
  });

  it("bounds summary integers and merges normalized language buckets", () => {
    const aggregate: UsageSummaryAggregate = {
      completedReviews: Number.MAX_SAFE_INTEGER + 10,
      deepReviews: -1,
      languageCounts: [
        { count: 2, language: "TypeScript" },
        { count: 3, language: "typescript" },
      ],
      statusCounts: [
        { count: 1, status: "PENDING" },
        { count: 2, status: "COMPLETED" },
      ],
      tokenTotals: {
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
      },
      totalReviews: 3,
    };

    const summary = toUsageSummary(aggregate, AS_OF);

    assert.equal(summary.completedReviews, Number.MAX_SAFE_INTEGER);
    assert.equal(summary.deepReviews, 0);
    assert.deepEqual(summary.languageDistribution, [{ count: 5, language: "typescript" }]);
    assert.deepEqual(summary.reviewsByStatus, {
      CANCELLED: 0,
      COMPLETED: 2,
      FAILED: 0,
      PENDING: 1,
      PROCESSING: 0,
    });
  });

  it("uses null for absent persisted usage while preserving persisted zero values", () => {
    const withoutResult: UsageHistoryRecord = {
      createdAt: AS_OF,
      language: "javascript",
      mode: "QUICK",
      result: null,
      reviewId: "pending-review",
      status: "PENDING",
    };
    const withZeroUsage: UsageHistoryRecord = {
      createdAt: AS_OF,
      language: "TypeScript",
      mode: "DEEP",
      result: {
        durationMs: 0,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      },
      reviewId: "completed-review",
      status: "COMPLETED",
    };

    assert.deepEqual(toUsageHistoryItem(withoutResult), {
      createdAt: AS_OF.toISOString(),
      durationMs: null,
      inputTokens: null,
      language: "javascript",
      mode: "QUICK",
      outputTokens: null,
      reviewId: "pending-review",
      status: "PENDING",
      totalTokens: null,
    });
    assert.deepEqual(toUsageHistoryItem(withZeroUsage), {
      createdAt: AS_OF.toISOString(),
      durationMs: 0,
      inputTokens: 0,
      language: "typescript",
      mode: "DEEP",
      outputTokens: 0,
      reviewId: "completed-review",
      status: "COMPLETED",
      totalTokens: 0,
    });
  });

  it("clamps quota remaining to zero at and above the configured boundary", () => {
    const utcDay = getUtcDayWindow(AS_OF);
    const quota = toUsageQuota(
      [
        { count: 2, mode: "QUICK" },
        { count: 1, mode: "STANDARD" },
        { count: 1, mode: "DEEP" },
      ],
      { dailyLimits: { DEEP: 0, QUICK: 2, STANDARD: 1 } },
      utcDay,
      AS_OF,
    );

    assert.deepEqual(quota, {
      asOf: AS_OF.toISOString(),
      modes: {
        DEEP: { limit: 0, remaining: 0, used: 1 },
        QUICK: { limit: 2, remaining: 0, used: 2 },
        STANDARD: { limit: 1, remaining: 0, used: 1 },
      },
      utcDay: "2026-08-06",
    });
  });
});
