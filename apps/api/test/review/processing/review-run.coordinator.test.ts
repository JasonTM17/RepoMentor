import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ReviewRunCoordinator } from "../../../src/modules/review/processing/review-run.coordinator.js";
import type {
  ReviewProcessingOutcome,
  ReviewProcessingRequest,
} from "../../../src/modules/review/processing/review-processing.types.js";

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly reject: (reason?: unknown) => void;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

describe("review run coordinator", () => {
  it("coalesces duplicate owned starts and aborts only through explicit cancellation", async () => {
    const run = deferred<ReviewProcessingOutcome>();
    const calls: ReviewProcessingRequest[] = [];
    const processing = {
      process: (input: ReviewProcessingRequest) => {
        calls.push(input);
        return run.promise;
      },
    };
    const coordinator = new ReviewRunCoordinator(processing as never);

    const first = coordinator.process({ userId: "owner-a", reviewId: "review-1" });
    const duplicate = coordinator.process({ userId: "owner-a", reviewId: "review-1" });

    assert.strictEqual(duplicate, first);
    assert.equal(calls.length, 1);
    assert.ok(calls[0]?.signal);
    assert.equal(calls[0]?.signal?.aborted, false);
    assert.equal(coordinator.cancel("owner-a", "review-1"), true);
    assert.equal(calls[0]?.signal?.aborted, true);

    const outcome = {} as ReviewProcessingOutcome;
    run.resolve(outcome);
    assert.strictEqual(await first, outcome);
    assert.equal(coordinator.cancel("owner-a", "review-1"), false);
  });

  it("keeps owners and retry handoff distinct and waits for the old run to settle", async () => {
    const firstRun = deferred<ReviewProcessingOutcome>();
    const secondRun = deferred<ReviewProcessingOutcome>();
    const runs = [firstRun, secondRun];
    let callCount = 0;
    const processing = {
      process: () => runs[callCount++]?.promise ?? Promise.reject(new Error("unexpected run")),
    };
    const coordinator = new ReviewRunCoordinator(processing as never);

    const ownerRun = coordinator.process({ userId: "owner-a", reviewId: "review-1" });
    const otherOwnerRun = coordinator.process({ userId: "owner-b", reviewId: "review-1" });
    let idle = false;
    const idlePromise = coordinator.waitForIdle("owner-a", "review-1").then(() => {
      idle = true;
    });

    await Promise.resolve();
    assert.equal(callCount, 2);
    assert.equal(idle, false);

    firstRun.resolve({} as ReviewProcessingOutcome);
    secondRun.resolve({} as ReviewProcessingOutcome);
    await Promise.all([ownerRun, otherOwnerRun, idlePromise]);
    assert.equal(idle, true);
  });

  it("clears a rejected run so a later explicit process can try again", async () => {
    const processing = {
      process: (() => {
        let calls = 0;
        return () => {
          calls += 1;
          return calls === 1
            ? Promise.reject(new Error("bounded failure"))
            : Promise.resolve({} as ReviewProcessingOutcome);
        };
      })(),
    };
    const coordinator = new ReviewRunCoordinator(processing as never);

    await assert.rejects(
      coordinator.process({ userId: "owner-a", reviewId: "review-1" }),
      /bounded failure/u,
    );
    await coordinator.process({ userId: "owner-a", reviewId: "review-1" });
    assert.equal(coordinator.cancel("owner-a", "review-1"), false);
  });
});
