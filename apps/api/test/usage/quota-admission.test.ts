import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InMemoryQuotaAdmissionRepository } from "../../src/modules/usage/in-memory-quota-admission.repository.js";
import {
  QuotaAdmissionConflictError,
  QuotaAdmissionInputError,
  QuotaAdmissionNotFoundError,
  QuotaAdmissionTransitionError,
} from "../../src/modules/usage/quota-admission.errors.js";
import {
  hashIdempotencyKey,
  normalizeIdempotencyKey,
} from "../../src/modules/usage/quota-admission.hash.js";
import { QuotaAdmissionService } from "../../src/modules/usage/quota-admission.service.js";

const NOW = new Date("2026-08-06T12:00:00.000Z");
const IDEMPOTENCY_KEY = "idempotency-key-123456";

function createService(): QuotaAdmissionService {
  return new QuotaAdmissionService(new InMemoryQuotaAdmissionRepository());
}

describe("quota admission idempotency boundary", () => {
  it("normalizes only canonical bounded keys and returns a stable SHA-256 hash", () => {
    assert.equal(normalizeIdempotencyKey(IDEMPOTENCY_KEY), IDEMPOTENCY_KEY);
    const firstHash = hashIdempotencyKey(IDEMPOTENCY_KEY);

    assert.equal(firstHash, hashIdempotencyKey(IDEMPOTENCY_KEY));
    assert.match(firstHash, /^[a-f0-9]{64}$/u);
    assert.notEqual(firstHash, hashIdempotencyKey("idempotency-key-567890"));

    for (const invalid of [
      "",
      "short",
      ` ${IDEMPOTENCY_KEY}`,
      `${IDEMPOTENCY_KEY} `,
      "idempotency key with spaces",
      "ключ-idempotency-key",
      "x".repeat(129),
      null,
      42,
    ]) {
      assert.throws(
        () => normalizeIdempotencyKey(invalid),
        (error: unknown) => {
          assert.ok(error instanceof QuotaAdmissionInputError);
          assert.equal(error.field, "idempotencyKey");
          assert.equal(error.message.includes(IDEMPOTENCY_KEY), false);
          return true;
        },
      );
    }
  });

  it("creates one owner-scoped intent, replays it, and isolates another owner", async () => {
    const service = createService();
    const first = await service.createIntent({
      idempotencyKey: IDEMPOTENCY_KEY,
      mode: "QUICK",
      now: NOW,
      userId: "owner-a",
    });
    const replay = await service.createIntent({
      idempotencyKey: IDEMPOTENCY_KEY,
      mode: "QUICK",
      now: NOW,
      userId: "owner-a",
    });
    const otherOwner = await service.createIntent({
      idempotencyKey: IDEMPOTENCY_KEY,
      mode: "QUICK",
      now: NOW,
      userId: "owner-b",
    });

    assert.equal(first.created, true);
    assert.equal(replay.created, false);
    assert.equal(replay.record.id, first.record.id);
    assert.equal(replay.record.reviewId, first.record.reviewId);
    assert.equal(otherOwner.created, true);
    assert.notEqual(otherOwner.record.id, first.record.id);
    assert.notEqual(otherOwner.record.reviewId, first.record.reviewId);
    assert.equal(first.record.utcDay, "2026-08-06");
    assert.equal(JSON.stringify(first.record).includes(IDEMPOTENCY_KEY), false);
    assert.equal(JSON.stringify(first.record).includes("source"), false);
    assert.equal(JSON.stringify(first.record).includes("token"), false);
  });

  it("rejects reuse with a different mode or UTC day without echoing the key", async () => {
    const service = createService();
    await service.createIntent({
      idempotencyKey: IDEMPOTENCY_KEY,
      mode: "STANDARD",
      now: NOW,
      userId: "owner-a",
    });

    await assert.rejects(
      service.createIntent({
        idempotencyKey: IDEMPOTENCY_KEY,
        mode: "DEEP",
        now: NOW,
        userId: "owner-a",
      }),
      (error: unknown) => {
        assert.ok(error instanceof QuotaAdmissionConflictError);
        assert.equal(error.message.includes(IDEMPOTENCY_KEY), false);
        return true;
      },
    );

    await assert.rejects(
      service.createIntent({
        idempotencyKey: IDEMPOTENCY_KEY,
        mode: "STANDARD",
        now: new Date("2026-08-07T00:00:00.000Z"),
        userId: "owner-a",
      }),
      QuotaAdmissionConflictError,
    );
  });
});

describe("quota admission owner-safe transitions", () => {
  it("allows legal transitions, makes same-state retries idempotent, and rejects illegal owners/states", async () => {
    const service = createService();
    const intent = await service.createIntent({
      idempotencyKey: IDEMPOTENCY_KEY,
      mode: "QUICK",
      now: NOW,
      userId: "owner-a",
    });
    const reservedAt = new Date("2026-08-06T12:01:00.000Z");

    const reserved = await service.transitionForOwner(
      "owner-a",
      intent.record.id,
      "RESERVED",
      reservedAt,
    );
    const replayed = await service.transitionForOwner(
      "owner-a",
      intent.record.id,
      "RESERVED",
      new Date("2026-08-06T12:02:00.000Z"),
    );

    assert.equal(reserved.status, "RESERVED");
    assert.equal(reserved.updatedAt.getTime(), reservedAt.getTime());
    assert.equal(replayed.updatedAt.getTime(), reservedAt.getTime());

    assert.equal(await service.findForOwner("owner-b", intent.record.id), null);
    await assert.rejects(
      service.transitionForOwner("owner-b", intent.record.id, "ADMITTED", reservedAt),
      (error: unknown) => error instanceof QuotaAdmissionNotFoundError,
    );
    await assert.rejects(
      service.transitionForOwner("owner-a", intent.record.id, "DENIED", reservedAt),
      (error: unknown) => {
        assert.ok(error instanceof QuotaAdmissionTransitionError);
        assert.equal(error.message.includes(intent.record.id), false);
        return true;
      },
    );

    const admitted = await service.transitionForOwner(
      "owner-a",
      intent.record.id,
      "ADMITTED",
      new Date("2026-08-06T12:03:00.000Z"),
    );
    assert.equal(admitted.status, "ADMITTED");
  });
});
