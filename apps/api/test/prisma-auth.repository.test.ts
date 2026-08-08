import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PrismaService } from "../src/modules/auth/prisma.service.js";
import { PrismaAuthRepository } from "../src/modules/auth/prisma-auth.repository.js";

const NOW = new Date("2026-08-08T02:00:00.000Z");

describe("Prisma auth repository", () => {
  it("updates the expected password and revokes active sessions in one transaction", async () => {
    let userUpdateArgs: Record<string, unknown> | undefined;
    let sessionUpdateArgs: Record<string, unknown> | undefined;
    const transactionClient = {
      session: {
        updateMany: async (args: Record<string, unknown>) => {
          sessionUpdateArgs = args;
          return { count: 2 };
        },
      },
      user: {
        updateMany: async (args: Record<string, unknown>) => {
          userUpdateArgs = args;
          return { count: 1 };
        },
      },
    };
    const prisma = {
      transaction: async <T>(callback: (client: typeof transactionClient) => Promise<T>) =>
        callback(transactionClient),
    } as unknown as PrismaService;
    const repository = new PrismaAuthRepository(prisma);

    const changed = await repository.changePassword({
      expectedPasswordHash: "old-hash",
      nextPasswordHash: "next-hash",
      now: NOW,
      userId: "user-123",
    });

    assert.equal(changed, true);
    assert.deepEqual(userUpdateArgs, {
      data: { passwordHash: "next-hash", updatedAt: NOW },
      where: { id: "user-123", passwordHash: "old-hash", status: "ACTIVE" },
    });
    assert.deepEqual(sessionUpdateArgs, {
      data: { revokedAt: NOW, revocationReason: "LOGOUT_ALL", status: "REVOKED" },
      where: { status: "ACTIVE", userId: "user-123" },
    });
  });

  it("does not revoke sessions when the expected password no longer matches", async () => {
    let sessionUpdateCount = 0;
    const transactionClient = {
      session: {
        updateMany: async () => {
          sessionUpdateCount += 1;
          return { count: 0 };
        },
      },
      user: {
        updateMany: async () => ({ count: 0 }),
      },
    };
    const prisma = {
      transaction: async <T>(callback: (client: typeof transactionClient) => Promise<T>) =>
        callback(transactionClient),
    } as unknown as PrismaService;
    const repository = new PrismaAuthRepository(prisma);

    const changed = await repository.changePassword({
      expectedPasswordHash: "stale-hash",
      nextPasswordHash: "next-hash",
      now: NOW,
      userId: "user-123",
    });

    assert.equal(changed, false);
    assert.equal(sessionUpdateCount, 0);
  });
});
