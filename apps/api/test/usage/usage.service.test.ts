import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { UsageService } from "../../src/modules/usage/usage.service.js";
import type { UsageRepository } from "../../src/modules/usage/usage.types.js";

describe("usage service quota day boundaries", () => {
  it("passes the owner and exact UTC-day bounds to the durable repository", async () => {
    let received:
      | {
          readonly endExclusive: Date;
          readonly start: Date;
          readonly userId: string;
        }
      | undefined;
    const repository: UsageRepository = {
      countReviewsForUserOnUtcDay: async (input) => {
        received = input;
        return [{ count: 1, mode: "QUICK" }];
      },
      getSummaryForUser: async () => {
        throw new Error("not used");
      },
      listHistoryForUser: async () => {
        throw new Error("not used");
      },
    };
    const service = new UsageService(repository, {
      dailyLimits: { DEEP: 3, QUICK: 20, STANDARD: 10 },
    });

    const response = await service.quota("owner-a", new Date("2026-08-06T23:59:59.999Z"));

    assert.equal(received?.userId, "owner-a");
    assert.equal(received?.start.toISOString(), "2026-08-06T00:00:00.000Z");
    assert.equal(received?.endExclusive.toISOString(), "2026-08-07T00:00:00.000Z");
    assert.equal(response.utcDay, "2026-08-06");
    assert.equal(response.modes.QUICK.used, 1);
    assert.equal(response.modes.QUICK.remaining, 19);
  });
});
