import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";

import type { Response } from "express";

import type { AuthRepository } from "../../src/modules/auth/auth.types.js";
import { InMemoryReviewRepository } from "../../src/modules/review/in-memory-review.repository.js";
import {
  ReviewEventStreamService,
  type ReviewEventStreamConfig,
} from "../../src/modules/review/review-events.service.js";
import type { ReviewRepository } from "../../src/modules/review/review.types.js";

const OWNER_ID = "stream-owner";
const OTHER_OWNER_ID = "stream-other";
const REVIEW_ID = "stream-review";
const SESSION_ID = "stream-session";

class FakeResponse extends EventEmitter {
  readonly headers = new Map<string, string>();
  readonly chunks: string[] = [];
  endCount = 0;
  statusCode = 0;
  writableEnded = false;
  destroyed = false;

  status(statusCode: number): this {
    this.statusCode = statusCode;
    return this;
  }

  setHeader(name: string, value: string): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  flushHeaders(): void {}

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  end(): this {
    this.endCount += 1;
    this.writableEnded = true;
    this.emit("close");
    return this;
  }

  disconnect(): void {
    this.destroyed = true;
    this.emit("close");
  }
}

function streamService(
  repository: ReviewRepository,
  config?: ReviewEventStreamConfig,
  authRepository?: AuthRepository,
): ReviewEventStreamService {
  return new ReviewEventStreamService(repository, config, authRepository);
}

async function createTerminalReview(repository: InMemoryReviewRepository): Promise<void> {
  await repository.create({
    id: REVIEW_ID,
    language: "typescript",
    mode: "STANDARD",
    learnerLevel: "INTERMEDIATE",
    source: "private source",
    userId: OWNER_ID,
  });
  await repository.transitionForUser(OWNER_ID, REVIEW_ID, {
    fromStatuses: ["PENDING"],
    now: new Date("2026-08-07T03:00:00.000Z"),
    toStatus: "PROCESSING",
  });
  await repository.transitionForUser(OWNER_ID, REVIEW_ID, {
    fromStatuses: ["PROCESSING"],
    now: new Date("2026-08-07T03:00:01.000Z"),
    toStatus: "CANCELLED",
  });
}

function frames(response: FakeResponse): Array<{
  readonly data: Record<string, unknown>;
  readonly event: string;
  readonly id: string;
}> {
  return response.chunks.map((chunk) => {
    const lines = chunk.trim().split("\n");
    const id = lines.find((line) => line.startsWith("id: "))?.slice(4);
    const event = lines.find((line) => line.startsWith("event: "))?.slice(7);
    const data = lines.find((line) => line.startsWith("data: "))?.slice(6);

    assert.ok(id);
    assert.ok(event);
    assert.ok(data);
    return { data: JSON.parse(data) as Record<string, unknown>, event, id };
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  assert.fail("timed out waiting for the SSE fixture");
}

describe("review lifecycle SSE service", () => {
  it("writes raw ordered status-only frames and closes at a terminal event", async () => {
    const repository = new InMemoryReviewRepository();
    await createTerminalReview(repository);
    const response = new FakeResponse();

    await streamService(repository).stream({
      response: response as unknown as Response,
      reviewId: REVIEW_ID,
      sessionId: SESSION_ID,
      userId: OWNER_ID,
    });

    const delivered = frames(response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
    assert.equal(response.headers.get("cache-control"), "no-cache, no-transform");
    assert.equal(response.headers.get("x-accel-buffering"), "no");
    assert.deepEqual(
      delivered.map((frame) => frame.id),
      ["1", "2", "3"],
    );
    assert.deepEqual(
      delivered.map((frame) => frame.event),
      ["snapshot", "snapshot", "cancelled"],
    );
    assert.equal(delivered[2]?.data.status, "CANCELLED");
    assert.equal("data" in delivered[2]!.data, false);
    assert.equal("source" in delivered[2]!.data, false);
    assert.equal("provider" in delivered[2]!.data, false);
    assert.equal(response.endCount, 1);
  });

  it("replays strictly after Last-Event-ID and resets a future cursor", async () => {
    const repository = new InMemoryReviewRepository();
    await createTerminalReview(repository);

    const replayResponse = new FakeResponse();
    await streamService(repository).stream({
      lastEventId: "1",
      response: replayResponse as unknown as Response,
      reviewId: REVIEW_ID,
      sessionId: SESSION_ID,
      userId: OWNER_ID,
    });
    assert.deepEqual(
      frames(replayResponse).map((frame) => frame.id),
      ["2", "3"],
    );

    const resetResponse = new FakeResponse();
    await streamService(repository).stream({
      lastEventId: "999",
      response: resetResponse as unknown as Response,
      reviewId: REVIEW_ID,
      sessionId: SESSION_ID,
      userId: OWNER_ID,
    });
    const reset = frames(resetResponse);
    assert.deepEqual(
      reset.map((frame) => frame.id),
      ["3"],
    );
    assert.equal(reset[0]?.event, "snapshot");
    assert.equal(reset[0]?.data.replay, "reset");
    assert.equal(reset[0]?.data.status, "CANCELLED");
  });

  it("uses an explicit reset when a valid cursor predates unavailable history", async () => {
    const latest = {
      createdAt: new Date("2026-08-07T03:00:00.000Z"),
      generation: 1,
      resultAvailable: true,
      retryable: null,
      reviewId: REVIEW_ID,
      sequence: 4,
      status: "COMPLETED" as const,
      type: "COMPLETED" as const,
    };
    const staleRepository = {
      findByIdForUser: async () => ({
        createdAt: latest.createdAt,
        deletedAt: null,
        id: REVIEW_ID,
        language: "typescript",
        mode: "STANDARD" as const,
        processingGeneration: 1,
        source: "private source",
        status: "COMPLETED" as const,
        updatedAt: latest.createdAt,
        userId: OWNER_ID,
      }),
      latestEventForUser: async () => latest,
      listEventsForUser: async () => [latest],
    } as unknown as ReviewRepository;
    const response = new FakeResponse();

    await streamService(staleRepository).stream({
      lastEventId: "1",
      response: response as unknown as Response,
      reviewId: REVIEW_ID,
      sessionId: SESSION_ID,
      userId: OWNER_ID,
    });

    const reset = frames(response);
    assert.deepEqual(
      reset.map((frame) => frame.id),
      ["4"],
    );
    assert.equal(reset[0]?.event, "snapshot");
    assert.equal(reset[0]?.data.replay, "reset");
  });

  it("sends a durable-ID heartbeat, then stops delivery on disconnect without cancelling", async () => {
    const repository = new InMemoryReviewRepository();
    await repository.create({
      id: REVIEW_ID,
      language: "typescript",
      mode: "STANDARD",
      learnerLevel: "INTERMEDIATE",
      source: "private source",
      userId: OWNER_ID,
    });
    const response = new FakeResponse();
    const stream = streamService(repository, {
      heartbeatIntervalMs: 1,
      maxLifetimeMs: 100,
      pollIntervalMs: 2,
    }).stream({
      response: response as unknown as Response,
      reviewId: REVIEW_ID,
      sessionId: SESSION_ID,
      userId: OWNER_ID,
    });

    await waitFor(() => frames(response).some((frame) => frame.event === "heartbeat"));
    response.disconnect();
    await stream;

    const latest = await repository.latestEventForUser(OWNER_ID, REVIEW_ID);
    assert.equal(latest?.status, "PENDING");
    assert.equal(latest?.sequence, 1);
    assert.equal(response.endCount, 0);
  });

  it("enforces a bounded lifetime for an active stream", async () => {
    const repository = new InMemoryReviewRepository();
    await repository.create({
      id: REVIEW_ID,
      language: "typescript",
      mode: "STANDARD",
      learnerLevel: "INTERMEDIATE",
      source: "source",
      userId: OWNER_ID,
    });
    const response = new FakeResponse();

    await streamService(repository, {
      heartbeatIntervalMs: 100,
      maxLifetimeMs: 10,
      pollIntervalMs: 2,
    }).stream({
      response: response as unknown as Response,
      reviewId: REVIEW_ID,
      sessionId: SESSION_ID,
      userId: OWNER_ID,
    });

    assert.equal(response.endCount, 1);
    assert.equal((await repository.latestEventForUser(OWNER_ID, REVIEW_ID))?.status, "PENDING");
  });

  it("stops delivery after the authenticated session is revoked", async () => {
    const repository = new InMemoryReviewRepository();
    await repository.create({
      id: REVIEW_ID,
      language: "typescript",
      mode: "STANDARD",
      learnerLevel: "INTERMEDIATE",
      source: "private source",
      userId: OWNER_ID,
    });
    let sessionActive = true;
    const authRepository = {
      findSessionById: async () =>
        sessionActive ? ({ status: "ACTIVE", userId: OWNER_ID } as const) : null,
      findUserById: async () => ({ id: OWNER_ID, status: "ACTIVE" as const }),
    } as unknown as AuthRepository;
    const response = new FakeResponse();
    const stream = streamService(
      repository,
      { heartbeatIntervalMs: 100, maxLifetimeMs: 100, pollIntervalMs: 2 },
      authRepository,
    ).stream({
      response: response as unknown as Response,
      reviewId: REVIEW_ID,
      sessionId: SESSION_ID,
      userId: OWNER_ID,
    });

    await waitFor(() => response.chunks.length === 1);
    sessionActive = false;
    await stream;

    assert.equal(response.endCount, 1);
    assert.equal(frames(response)[0]?.data.status, "PENDING");
  });

  it("allows only one active local stream for one review", async () => {
    const repository = new InMemoryReviewRepository();
    await repository.create({
      id: REVIEW_ID,
      language: "typescript",
      mode: "STANDARD",
      learnerLevel: "INTERMEDIATE",
      source: "private source",
      userId: OWNER_ID,
    });
    const service = streamService(repository, {
      heartbeatIntervalMs: 100,
      maxLifetimeMs: 100,
      pollIntervalMs: 2,
    });
    const firstResponse = new FakeResponse();
    const firstStream = service.stream({
      response: firstResponse as unknown as Response,
      reviewId: REVIEW_ID,
      sessionId: SESSION_ID,
      userId: OWNER_ID,
    });

    await waitFor(() => firstResponse.chunks.length === 1);
    await assert.rejects(
      service.stream({
        response: new FakeResponse() as unknown as Response,
        reviewId: REVIEW_ID,
        sessionId: SESSION_ID,
        userId: OWNER_ID,
      }),
      { name: "ConflictException" },
    );
    firstResponse.disconnect();
    await firstStream;
  });

  it("does not reveal whether another owner has a review", async () => {
    const repository = new InMemoryReviewRepository();
    await repository.create({
      id: REVIEW_ID,
      language: "typescript",
      mode: "STANDARD",
      learnerLevel: "INTERMEDIATE",
      source: "source",
      userId: OWNER_ID,
    });
    const response = new FakeResponse();

    await assert.rejects(
      streamService(repository).stream({
        response: response as unknown as Response,
        reviewId: REVIEW_ID,
        sessionId: SESSION_ID,
        userId: OTHER_OWNER_ID,
      }),
      { name: "NotFoundException" },
    );
    assert.equal(response.chunks.length, 0);
    assert.equal(response.statusCode, 0);
  });
});
