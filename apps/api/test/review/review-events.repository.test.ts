import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InMemoryReviewRepository } from "../../src/modules/review/in-memory-review.repository.js";

const OWNER_ID = "event-owner";
const OTHER_OWNER_ID = "other-owner";
const REVIEW_ID = "event-review";
const NOW = new Date("2026-08-07T02:00:00.000Z");

function transition(
  fromStatuses: readonly ("PENDING" | "PROCESSING" | "FAILED")[],
  toStatus: "PROCESSING" | "FAILED" | "PENDING",
  retryable?: boolean,
) {
  return {
    fromStatuses,
    now: NOW,
    toStatus,
    ...(retryable === undefined ? {} : { retryable }),
  } as const;
}

describe("in-memory review lifecycle event seam", () => {
  it("assigns ordered durable-shaped IDs and keeps the payload status-only", async () => {
    const repository = new InMemoryReviewRepository();
    await repository.create({
      id: REVIEW_ID,
      language: "typescript",
      mode: "STANDARD",
      source: "private source that must not cross the stream",
      userId: OWNER_ID,
    });

    await repository.transitionForUser(OWNER_ID, REVIEW_ID, transition(["PENDING"], "PROCESSING"));
    await repository.transitionForUser(
      OWNER_ID,
      REVIEW_ID,
      transition(["PROCESSING"], "FAILED", true),
    );
    await repository.transitionForUser(OWNER_ID, REVIEW_ID, transition(["FAILED"], "PENDING"));

    const events = await repository.listEventsForUser(OWNER_ID, REVIEW_ID, 0, 20);

    assert.deepEqual(
      events.map((event) => [event.sequence, event.type, event.status, event.retryable]),
      [
        [1, "SNAPSHOT", "PENDING", null],
        [2, "SNAPSHOT", "PROCESSING", null],
        [3, "FAILED", "FAILED", true],
        [4, "SNAPSHOT", "PENDING", null],
      ],
    );
    const failedEvent = events[2];
    assert.ok(failedEvent);
    assert.deepEqual(Object.keys(failedEvent).sort(), [
      "createdAt",
      "generation",
      "resultAvailable",
      "retryable",
      "reviewId",
      "sequence",
      "status",
      "type",
    ]);
    assert.equal(JSON.stringify(events).includes("private source"), false);
    assert.equal(JSON.stringify(events).includes('"result":'), false);
  });

  it("replays exclusively after a cursor and isolates owners", async () => {
    const repository = new InMemoryReviewRepository();
    await repository.create({
      id: REVIEW_ID,
      language: "typescript",
      mode: "STANDARD",
      source: "source",
      userId: OWNER_ID,
    });
    await repository.transitionForUser(OWNER_ID, REVIEW_ID, transition(["PENDING"], "PROCESSING"));

    const replay = await repository.listEventsForUser(OWNER_ID, REVIEW_ID, 1, 20);
    assert.deepEqual(
      replay.map((event) => event.sequence),
      [2],
    );
    assert.deepEqual(await repository.listEventsForUser(OTHER_OWNER_ID, REVIEW_ID, 0, 20), []);
    assert.equal(await repository.latestEventForUser(OTHER_OWNER_ID, REVIEW_ID), null);
  });
});
