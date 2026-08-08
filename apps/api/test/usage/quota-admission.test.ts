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
import {
  computeQuotaAdmissionFingerprint,
  QUOTA_ADMISSION_FINGERPRINT_VERSION,
  type QuotaAdmissionFingerprintInput,
} from "../../src/modules/usage/quota-admission.fingerprint.js";
import { QuotaAdmissionService } from "../../src/modules/usage/quota-admission.service.js";

const NOW = new Date("2026-08-06T12:00:00.000Z");
const IDEMPOTENCY_KEY = "idempotency-key-123456";
const FINGERPRINT_SECRET = "quota-admission-test-fingerprint-secret-32-bytes";
const FINGERPRINT_SOURCE = "const answer = 42;\n";
const FINGERPRINT_KEY = "idempotency-key-fingerprint-123456";
const FINGERPRINT_OWNER_A = "fingerprint-owner-a";
const FINGERPRINT_OWNER_B = "fingerprint-owner-b";

function createService(): QuotaAdmissionService {
  return new QuotaAdmissionService(new InMemoryQuotaAdmissionRepository());
}

function createFingerprint(overrides: Partial<QuotaAdmissionFingerprintInput> = {}): {
  requestFingerprintHash: string;
  fingerprintVersion: number;
} {
  return computeQuotaAdmissionFingerprint(FINGERPRINT_SECRET, {
    fingerprintVersion: QUOTA_ADMISSION_FINGERPRINT_VERSION,
    language: "TypeScript",
    mode: "STANDARD",
    learnerLevel: "INTERMEDIATE",
    source: FINGERPRINT_SOURCE,
    ...overrides,
  });
}

function assertJsonOmitsRawMaterial(value: unknown, rawMaterials: readonly string[]): void {
  const serialized = JSON.stringify(value);
  assert.ok(serialized !== undefined);

  for (const rawMaterial of rawMaterials) {
    assert.equal(serialized.includes(rawMaterial), false);
    const encodedRawMaterial = JSON.stringify(rawMaterial);
    assert.ok(encodedRawMaterial !== undefined);
    assert.equal(serialized.includes(encodedRawMaterial), false);
  }
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

  it("replays identical owner fingerprints and rejects conflicting metadata without mutation", async () => {
    const service = createService();
    const fingerprint = createFingerprint();
    const differentHash = createFingerprint({ source: "const answer = 43;\n" });
    const differentVersion = createFingerprint({
      fingerprintVersion: QUOTA_ADMISSION_FINGERPRINT_VERSION + 1,
    });
    const rawMaterials = [FINGERPRINT_SOURCE, FINGERPRINT_KEY, FINGERPRINT_SECRET];
    const first = await service.createIntent({
      admissionId: "fp-admission-owner-a",
      fingerprintVersion: fingerprint.fingerprintVersion,
      idempotencyKey: FINGERPRINT_KEY,
      mode: "STANDARD",
      now: NOW,
      requestFingerprintHash: fingerprint.requestFingerprintHash,
      reviewId: "fp-review-owner-a",
      userId: FINGERPRINT_OWNER_A,
    });
    const replay = await service.createIntent({
      admissionId: "fp-admission-replay",
      fingerprintVersion: fingerprint.fingerprintVersion,
      idempotencyKey: FINGERPRINT_KEY,
      mode: "STANDARD",
      now: NOW,
      requestFingerprintHash: fingerprint.requestFingerprintHash,
      reviewId: "fp-review-replay",
      userId: FINGERPRINT_OWNER_A,
    });

    assert.equal(first.created, true);
    assert.equal(replay.created, false);
    assert.deepEqual(replay.record, first.record);
    assertJsonOmitsRawMaterial(first.record, rawMaterials);

    const conflicts = [
      {
        admissionId: "fp-conflict-hash",
        input: {
          admissionId: "fp-conflict-hash",
          fingerprintVersion: fingerprint.fingerprintVersion,
          idempotencyKey: FINGERPRINT_KEY,
          mode: "STANDARD" as const,
          now: NOW,
          requestFingerprintHash: differentHash.requestFingerprintHash,
          reviewId: "fp-review-hash",
          userId: FINGERPRINT_OWNER_A,
        },
      },
      {
        admissionId: "fp-conflict-missing",
        input: {
          admissionId: "fp-conflict-missing",
          idempotencyKey: FINGERPRINT_KEY,
          mode: "STANDARD" as const,
          now: NOW,
          reviewId: "fp-review-missing",
          userId: FINGERPRINT_OWNER_A,
        },
      },
      {
        admissionId: "fp-conflict-version",
        input: {
          admissionId: "fp-conflict-version",
          fingerprintVersion: differentVersion.fingerprintVersion,
          idempotencyKey: FINGERPRINT_KEY,
          mode: "STANDARD" as const,
          now: NOW,
          requestFingerprintHash: fingerprint.requestFingerprintHash,
          reviewId: "fp-review-version",
          userId: FINGERPRINT_OWNER_A,
        },
      },
    ];

    for (const conflict of conflicts) {
      await assert.rejects(service.createIntent(conflict.input), (error: unknown) => {
        assert.ok(error instanceof QuotaAdmissionConflictError);
        assertJsonOmitsRawMaterial(
          { code: error.code, message: error.message, name: error.name },
          rawMaterials,
        );
        return true;
      });
      assert.deepEqual(
        await service.findForOwner(FINGERPRINT_OWNER_A, first.record.id),
        first.record,
      );
      assert.equal(await service.findForOwner(FINGERPRINT_OWNER_A, conflict.admissionId), null);
    }

    const otherOwner = await service.createIntent({
      admissionId: "fp-admission-owner-b",
      fingerprintVersion: fingerprint.fingerprintVersion,
      idempotencyKey: FINGERPRINT_KEY,
      mode: "STANDARD",
      now: NOW,
      requestFingerprintHash: fingerprint.requestFingerprintHash,
      reviewId: "fp-review-owner-b",
      userId: FINGERPRINT_OWNER_B,
    });

    assert.equal(otherOwner.created, true);
    assert.notEqual(otherOwner.record.id, first.record.id);
    assert.notEqual(otherOwner.record.reviewId, first.record.reviewId);
    assert.deepEqual(
      await service.findForOwner(FINGERPRINT_OWNER_A, first.record.id),
      first.record,
    );
    assertJsonOmitsRawMaterial(otherOwner.record, rawMaterials);
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

    await assert.rejects(
      service.transitionForOwner(
        "owner-a",
        intent.record.id,
        "ADMITTED",
        new Date("2026-08-06T12:03:00.000Z"),
      ),
      (error: unknown) => {
        assert.ok(error instanceof QuotaAdmissionTransitionError);
        assert.equal(error.message.includes(intent.record.id), false);
        return true;
      },
    );
    assert.deepEqual(await service.findForOwner("owner-a", intent.record.id), reserved);
  });
});
