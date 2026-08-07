import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RedisCommandError, type RedisOperation } from "../../src/modules/redis/redis.errors.js";
import {
  acquireReviewStreamLease,
  RELEASE_REVIEW_STREAM_LEASE_SCRIPT,
  releaseReviewStreamLease,
} from "../../src/modules/redis/redis.stream.js";
import type {
  RedisCommandExecutor,
  RedisEvalOptions,
  RedisSetOptions,
} from "../../src/modules/redis/redis.types.js";

class FakeStreamExecutor implements RedisCommandExecutor {
  private value: string | undefined;

  async eval(
    script: string,
    options: RedisEvalOptions,
    operation: RedisOperation,
  ): Promise<unknown> {
    assert.equal(script, RELEASE_REVIEW_STREAM_LEASE_SCRIPT);
    assert.equal(operation, "stream-release");
    if (this.value === options.arguments[0]) {
      this.value = undefined;
      return 1;
    }

    return 0;
  }

  async set(
    key: string,
    value: string,
    options: RedisSetOptions,
    operation: RedisOperation,
  ): Promise<"OK" | null> {
    assert.match(key, /^repomentor:stream:review:/u);
    assert.equal(options.NX, true);
    assert.equal(operation, "stream-acquisition");
    if (this.value !== undefined) {
      return null;
    }

    this.value = value;
    return "OK";
  }
}

describe("review stream Redis lease", () => {
  it("atomically admits one review stream and releases only its owner token", async () => {
    const executor = new FakeStreamExecutor();
    const first = await acquireReviewStreamLease(executor, {
      reviewId: "stream-review",
      token: "stream-token-a",
      ttlMs: 125_000,
    });
    const second = await acquireReviewStreamLease(executor, {
      reviewId: "stream-review",
      token: "stream-token-b",
      ttlMs: 125_000,
    });

    assert.deepEqual(first, { acquired: true, token: "stream-token-a" });
    assert.deepEqual(second, { acquired: false });
    assert.equal(await releaseReviewStreamLease(executor, "stream-review", "wrong-token"), false);
    assert.equal(await releaseReviewStreamLease(executor, "stream-review", "stream-token-a"), true);
    assert.equal(
      (
        await acquireReviewStreamLease(executor, {
          reviewId: "stream-review",
          token: "stream-token-c",
          ttlMs: 125_000,
        })
      ).acquired,
      true,
    );
  });

  it("rejects malformed release replies instead of treating them as success", async () => {
    const executor = {
      eval: async () => "unexpected",
      set: async () => "OK" as const,
    } as unknown as RedisCommandExecutor;

    await assert.rejects(
      releaseReviewStreamLease(executor, "stream-review", "stream-token"),
      RedisCommandError,
    );
  });
});
