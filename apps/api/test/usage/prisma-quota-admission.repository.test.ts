import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PrismaService } from "../../src/modules/auth/prisma.service.js";
import { PrismaQuotaAdmissionRepository } from "../../src/modules/usage/prisma-quota-admission.repository.js";

const NOW = new Date("2026-08-06T12:00:00.000Z");
const ROW = {
  createdAt: NOW,
  id: "admission-123",
  idempotencyKeyHash: "a".repeat(64),
  mode: "QUICK",
  reviewId: "review-123",
  status: "PENDING",
  updatedAt: NOW,
  userId: "owner-a",
  utcDay: new Date("2026-08-06T00:00:00.000Z"),
};

describe("Prisma quota admission repository", () => {
  it("uses only the owner/hash and stores no raw idempotency material", async () => {
    let stored: typeof ROW | null = null;
    let createArgs: Record<string, unknown> | undefined;
    let lookupArgs: Record<string, unknown> | undefined;
    const transactionClient = {
      quotaAdmission: {
        create: async (args: { readonly data: Record<string, unknown> }) => {
          createArgs = args.data;
          stored = { ...ROW };
          return stored;
        },
        findFirst: async () => stored,
        findUnique: async (args: { readonly where: Record<string, unknown> }) => {
          lookupArgs = args.where;
          return stored;
        },
        updateMany: async () => ({ count: 0 }),
      },
    };
    const prisma = {
      transaction: async <T>(callback: (client: typeof transactionClient) => Promise<T>) =>
        callback(transactionClient),
    } as unknown as PrismaService;
    const repository = new PrismaQuotaAdmissionRepository(prisma);
    const rawKey = "idempotency-key-1234";
    const input = {
      id: "admission-123",
      idempotencyKeyHash: "a".repeat(64),
      mode: "QUICK" as const,
      now: NOW,
      reviewId: "review-123",
      userId: "owner-a",
      utcDay: "2026-08-06",
    };

    const created = await repository.createOrGet(input);
    const replay = await repository.createOrGet(input);

    assert.equal(created.created, true);
    assert.equal(replay.created, false);
    assert.deepEqual(lookupArgs, {
      userId_idempotencyKeyHash: {
        idempotencyKeyHash: "a".repeat(64),
        userId: "owner-a",
      },
    });
    assert.equal(createArgs?.idempotencyKey, undefined);
    assert.equal(JSON.stringify(createArgs).includes(rawKey), false);
    assert.equal(createArgs?.idempotencyKeyHash, "a".repeat(64));
    assert.equal(createArgs?.reviewId, "review-123");
  });

  it("uses owner checks and legal status predicates in the short transaction", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];
    let currentStatus = "PENDING";
    const transactionClient = {
      quotaAdmission: {
        findFirst: async (args: { readonly where: { readonly userId: string } }) =>
          args.where.userId === "owner-a" ? { ...ROW, status: currentStatus } : null,
        findUnique: async () => null,
        updateMany: async (args: Record<string, unknown>) => {
          updateCalls.push(args);
          currentStatus = "ADMITTED";
          return { count: 1 };
        },
      },
    };
    const prisma = {
      transaction: async <T>(callback: (client: typeof transactionClient) => Promise<T>) =>
        callback(transactionClient),
    } as unknown as PrismaService;
    const repository = new PrismaQuotaAdmissionRepository(prisma);

    const admitted = await repository.transitionForOwner(
      "owner-a",
      "admission-123",
      "ADMITTED",
      new Date("2026-08-06T12:01:00.000Z"),
    );

    assert.equal(admitted.status, "ADMITTED");
    assert.equal(updateCalls.length, 1);
    assert.deepEqual(updateCalls[0]?.where, {
      id: "admission-123",
      status: { in: ["RESERVED", "RECONCILE_REQUIRED"] },
      userId: "owner-a",
    });

    assert.equal(await repository.findForOwner("owner-b", "admission-123"), null);
  });
});
