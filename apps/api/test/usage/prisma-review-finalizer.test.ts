import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Prisma, QuotaAdmission, Review as PrismaReview } from "@prisma/client";

import { PrismaService } from "../../src/modules/auth/prisma.service.js";
import { PrismaReviewFinalizer } from "../../src/modules/usage/prisma-review-finalizer.js";
import {
  ReviewFinalizerConflictError,
  ReviewFinalizerIndeterminateError,
  ReviewFinalizerInputError,
  ReviewFinalizerNotFoundError,
  ReviewFinalizerUnavailableError,
} from "../../src/modules/usage/review-finalizer.errors.js";
import type { FinalizeReviewInput } from "../../src/modules/usage/review-finalizer.types.js";

const NOW = new Date("2026-08-07T01:00:00.000Z");
const OWNER = "owner-a";
const OTHER_OWNER = "owner-b";
const ADMISSION_ID = "admission-a";
const REVIEW_ID = "review-a";
const FINGERPRINT_VERSION = 2;
const FINGERPRINT_HASH = "a".repeat(64);

function admission(
  status: QuotaAdmission["status"] = "RESERVED",
  overrides: Partial<QuotaAdmission> = {},
): QuotaAdmission {
  return {
    createdAt: NOW,
    fingerprintVersion: FINGERPRINT_VERSION,
    id: ADMISSION_ID,
    idempotencyKeyHash: "a".repeat(64),
    mode: "STANDARD",
    requestFingerprintHash: FINGERPRINT_HASH,
    reviewId: REVIEW_ID,
    status,
    updatedAt: NOW,
    userId: OWNER,
    utcDay: new Date("2026-08-07T00:00:00.000Z"),
    ...overrides,
  };
}

function review(overrides: Partial<PrismaReview> = {}): PrismaReview {
  return {
    createdAt: NOW,
    deletedAt: null,
    id: REVIEW_ID,
    language: "typescript",
    mode: "STANDARD",
    learnerLevel: "INTERMEDIATE",
    title: null,
    context: null,
    eventSequence: 1,
    processingGeneration: 0,
    source: "const answer = 42;",
    status: "PENDING",
    updatedAt: NOW,
    userId: OWNER,
    ...overrides,
  };
}

function input(overrides: Partial<FinalizeReviewInput> = {}): FinalizeReviewInput {
  return {
    admissionId: ADMISSION_ID,
    language: " TypeScript ",
    mode: "STANDARD",
    learnerLevel: "ADVANCED",
    title: "Review title",
    context: "Review context",
    now: NOW,
    reviewId: REVIEW_ID,
    fingerprintVersion: FINGERPRINT_VERSION,
    requestFingerprintHash: FINGERPRINT_HASH,
    source: "const answer = 42;",
    userId: OWNER,
    ...overrides,
  };
}

function createFixture(
  options: {
    readonly initialAdmission?: QuotaAdmission;
    readonly initialReview?: PrismaReview | null;
    readonly failReviewCreate?: Error;
    readonly failAdmissionUpdate?: Error;
  } = {},
) {
  let currentAdmission = options.initialAdmission ?? admission();
  let currentReview = options.initialReview ?? null;
  const events: string[] = [];
  let reviewCreateArgs: Prisma.ReviewCreateArgs | undefined;
  let admissionUpdateArgs: Prisma.QuotaAdmissionUpdateManyArgs | undefined;
  let reviewFindArgs: Prisma.ReviewFindFirstArgs | undefined;

  const transactionClient = {
    quotaAdmission: {
      findFirst: async (args: Prisma.QuotaAdmissionFindFirstArgs) => {
        events.push("quotaAdmission.findFirst");
        const where = args.where as { readonly id?: string; readonly userId?: string };
        return where.id === currentAdmission.id && where.userId === currentAdmission.userId
          ? currentAdmission
          : null;
      },
      updateMany: async (args: Prisma.QuotaAdmissionUpdateManyArgs) => {
        events.push("quotaAdmission.updateMany");
        admissionUpdateArgs = args;
        if (options.failAdmissionUpdate) {
          throw options.failAdmissionUpdate;
        }

        const where = args.where as {
          readonly id?: string;
          readonly reviewId?: string;
          readonly status?: string;
          readonly userId?: string;
        };
        if (
          currentAdmission.status !== "RESERVED" ||
          where.id !== currentAdmission.id ||
          where.reviewId !== currentAdmission.reviewId ||
          where.userId !== currentAdmission.userId ||
          where.status !== "RESERVED"
        ) {
          return { count: 0 };
        }

        currentAdmission = {
          ...currentAdmission,
          status: "ADMITTED",
          updatedAt: args.data.updatedAt as Date,
        };
        return { count: 1 };
      },
    },
    review: {
      create: async (args: Prisma.ReviewCreateArgs) => {
        events.push("review.create");
        reviewCreateArgs = args;
        if (options.failReviewCreate) {
          throw options.failReviewCreate;
        }

        const data = args.data as {
          readonly createdAt: Date;
          readonly eventSequence: number;
          readonly id: string;
          readonly language: string;
          readonly mode: PrismaReview["mode"];
          readonly learnerLevel: PrismaReview["learnerLevel"];
          readonly title: string | null;
          readonly context: string | null;
          readonly source: string;
          readonly status: PrismaReview["status"];
          readonly updatedAt: Date;
          readonly userId: string;
        };
        currentReview = review({
          createdAt: data.createdAt,
          eventSequence: data.eventSequence,
          id: data.id,
          language: data.language,
          mode: data.mode,
          learnerLevel: data.learnerLevel,
          title: data.title,
          context: data.context,
          source: data.source,
          status: data.status,
          updatedAt: data.updatedAt,
          userId: data.userId,
        });
        return currentReview;
      },
      findFirst: async (args: Prisma.ReviewFindFirstArgs) => {
        events.push("review.findFirst");
        reviewFindArgs = args;
        const existing = currentReview;
        const where = args.where as {
          readonly deletedAt?: Date | null;
          readonly id?: string;
          readonly userId?: string;
        };
        return existing !== null &&
          where.deletedAt === null &&
          existing.deletedAt === null &&
          existing.id === where.id &&
          existing.userId === where.userId
          ? existing
          : null;
      },
    },
    reviewEvent: {
      create: async () => {
        events.push("reviewEvent.create");
        return {};
      },
    },
  } as unknown as Prisma.TransactionClient;

  const prisma = {
    transaction: async <T>(callback: (client: Prisma.TransactionClient) => Promise<T>) => {
      events.push("transaction:start");
      const previousAdmission = currentAdmission;
      const previousReview = currentReview;

      try {
        const result = await callback(transactionClient);
        events.push("transaction:commit");
        return result;
      } catch (error: unknown) {
        currentAdmission = previousAdmission;
        currentReview = previousReview;
        events.push("transaction:rollback");
        throw error;
      }
    },
  } as unknown as PrismaService;

  return {
    finalizer: new PrismaReviewFinalizer(prisma),
    get admission() {
      return currentAdmission;
    },
    admissionUpdateArgs: () => admissionUpdateArgs,
    events,
    get review() {
      return currentReview;
    },
    reviewCreateArgs: () => reviewCreateArgs,
    reviewFindArgs: () => reviewFindArgs,
  };
}

describe("Prisma review finalizer", () => {
  it("creates the preallocated pending review, admits atomically, and omits source/userId", async () => {
    const fixture = createFixture();

    const result = await fixture.finalizer.finalize(input());

    assert.equal(result.kind, "FINALIZED");
    assert.deepEqual(result.summary, {
      createdAt: NOW,
      id: REVIEW_ID,
      language: "typescript",
      mode: "STANDARD",
      learnerLevel: "ADVANCED",
      title: "Review title",
      context: "Review context",
      status: "PENDING",
      updatedAt: NOW,
    });
    assert.equal("source" in result.summary, false);
    assert.equal("userId" in result.summary, false);
    assert.equal(JSON.stringify(result).includes("const answer"), false);
    assert.equal(JSON.stringify(result).includes(FINGERPRINT_HASH), false);
    assert.deepEqual(fixture.reviewCreateArgs()?.data, {
      createdAt: NOW,
      eventSequence: 1,
      id: REVIEW_ID,
      language: "typescript",
      mode: "STANDARD",
      learnerLevel: "ADVANCED",
      title: "Review title",
      context: "Review context",
      source: "const answer = 42;",
      status: "PENDING",
      updatedAt: NOW,
      userId: OWNER,
    });
    assert.deepEqual(fixture.admissionUpdateArgs()?.where, {
      id: ADMISSION_ID,
      reviewId: REVIEW_ID,
      status: "RESERVED",
      userId: OWNER,
    });
    assert.equal(fixture.admission.status, "ADMITTED");
    assert.deepEqual(fixture.events, [
      "transaction:start",
      "quotaAdmission.findFirst",
      "review.create",
      "reviewEvent.create",
      "quotaAdmission.updateMany",
      "transaction:commit",
    ]);
  });

  it("rejects missing or partial server fingerprint metadata before opening a transaction", async () => {
    for (const metadata of [
      { fingerprintVersion: undefined, requestFingerprintHash: FINGERPRINT_HASH },
      { fingerprintVersion: FINGERPRINT_VERSION, requestFingerprintHash: undefined },
    ]) {
      const fixture = createFixture();

      await assert.rejects(
        fixture.finalizer.finalize({ ...input(), ...metadata } as unknown as FinalizeReviewInput),
        (error: unknown) => {
          assert.ok(error instanceof ReviewFinalizerInputError);
          assert.equal(error.message.includes(FINGERPRINT_HASH), false);
          return true;
        },
      );

      assert.equal(fixture.review, null);
      assert.equal(fixture.admission.status, "RESERVED");
      assert.deepEqual(fixture.events, []);
    }
  });

  it("rejects missing, partial, or mismatched stored fingerprints before either write", async () => {
    const cases: Array<Partial<QuotaAdmission>> = [
      { fingerprintVersion: null, requestFingerprintHash: null },
      { fingerprintVersion: FINGERPRINT_VERSION, requestFingerprintHash: null },
      { fingerprintVersion: null, requestFingerprintHash: FINGERPRINT_HASH },
      { fingerprintVersion: FINGERPRINT_VERSION, requestFingerprintHash: "b".repeat(64) },
    ];

    for (const fingerprint of cases) {
      const fixture = createFixture({ initialAdmission: admission("RESERVED", fingerprint) });

      await assert.rejects(fixture.finalizer.finalize(input()), (error: unknown) => {
        assert.ok(error instanceof ReviewFinalizerConflictError);
        assert.equal(error.message.includes(FINGERPRINT_HASH), false);
        return true;
      });

      assert.equal(fixture.review, null);
      assert.equal(fixture.admission.status, "RESERVED");
      assert.deepEqual(fixture.events, [
        "transaction:start",
        "quotaAdmission.findFirst",
        "transaction:rollback",
      ]);
    }
  });

  it("rolls back the created review and admission when the second write fails", async () => {
    const failure = new Error(`database detail contains ${REVIEW_ID} and ${OWNER}`);
    const fixture = createFixture({ failAdmissionUpdate: failure });

    await assert.rejects(fixture.finalizer.finalize(input()), (error: unknown) => {
      assert.ok(error instanceof ReviewFinalizerUnavailableError);
      assert.equal(error.message.includes(REVIEW_ID), false);
      assert.equal(error.message.includes(OWNER), false);
      return true;
    });

    assert.equal(fixture.review, null);
    assert.equal(fixture.admission.status, "RESERVED");
    assert.deepEqual(fixture.events, [
      "transaction:start",
      "quotaAdmission.findFirst",
      "review.create",
      "reviewEvent.create",
      "quotaAdmission.updateMany",
      "transaction:rollback",
    ]);
  });

  it("maps a review identity collision to a redacted conflict", async () => {
    const collision = Object.assign(new Error(`duplicate ${REVIEW_ID} for ${OWNER}`), {
      code: "P2002",
    });
    const fixture = createFixture({ failReviewCreate: collision });

    await assert.rejects(fixture.finalizer.finalize(input()), (error: unknown) => {
      assert.ok(error instanceof ReviewFinalizerConflictError);
      assert.equal(error.message.includes(REVIEW_ID), false);
      assert.equal(error.message.includes(OWNER), false);
      return true;
    });

    assert.equal(fixture.review, null);
    assert.equal(fixture.admission.status, "RESERVED");
  });

  it("enforces owner isolation before reading or writing a review", async () => {
    const fixture = createFixture();

    await assert.rejects(
      fixture.finalizer.finalize(input({ userId: OTHER_OWNER })),
      (error: unknown) => error instanceof ReviewFinalizerNotFoundError,
    );

    assert.equal(fixture.review, null);
    assert.deepEqual(fixture.events, [
      "transaction:start",
      "quotaAdmission.findFirst",
      "transaction:rollback",
    ]);
  });

  it("replays an admitted owner review without mutating timestamps", async () => {
    const createdAt = new Date("2026-08-07T00:00:00.000Z");
    const updatedAt = new Date("2026-08-07T00:30:00.000Z");
    const fixture = createFixture({
      initialAdmission: { ...admission("ADMITTED"), updatedAt },
      initialReview: review({ createdAt, updatedAt }),
    });

    const result = await fixture.finalizer.finalize(
      input({ language: "JavaScript", source: "replay source is ignored" }),
    );

    assert.equal(result.kind, "REPLAYED");
    assert.deepEqual(result.summary, {
      createdAt,
      id: REVIEW_ID,
      language: "typescript",
      mode: "STANDARD",
      learnerLevel: "INTERMEDIATE",
      status: "PENDING",
      updatedAt,
    });
    assert.equal(fixture.admission.updatedAt, updatedAt);
    assert.deepEqual(fixture.events, [
      "transaction:start",
      "quotaAdmission.findFirst",
      "review.findFirst",
      "transaction:commit",
    ]);
    assert.deepEqual(fixture.reviewFindArgs()?.where, {
      deletedAt: null,
      id: REVIEW_ID,
      userId: OWNER,
    });
  });

  it("rejects a mismatched fingerprint on an admitted replay without mutation", async () => {
    const updatedAt = new Date("2026-08-07T00:30:00.000Z");
    const fixture = createFixture({
      initialAdmission: { ...admission("ADMITTED"), updatedAt },
      initialReview: review({ updatedAt }),
    });

    await assert.rejects(
      fixture.finalizer.finalize(input({ requestFingerprintHash: "b".repeat(64) })),
      (error: unknown) => error instanceof ReviewFinalizerConflictError,
    );

    assert.equal(fixture.admission.status, "ADMITTED");
    assert.equal(fixture.review?.updatedAt, updatedAt);
    assert.deepEqual(fixture.events, [
      "transaction:start",
      "quotaAdmission.findFirst",
      "transaction:rollback",
    ]);
  });

  it("does not replay an admitted legacy row without fingerprint metadata", async () => {
    const fixture = createFixture({
      initialAdmission: admission("ADMITTED", {
        fingerprintVersion: null,
        requestFingerprintHash: null,
      }),
      initialReview: review(),
    });

    await assert.rejects(
      fixture.finalizer.finalize(input()),
      (error: unknown) => error instanceof ReviewFinalizerConflictError,
    );

    assert.equal(fixture.admission.status, "ADMITTED");
    assert.deepEqual(fixture.events, [
      "transaction:start",
      "quotaAdmission.findFirst",
      "transaction:rollback",
    ]);
  });

  it("reports an admitted admission without a review as indeterminate", async () => {
    const fixture = createFixture({ initialAdmission: admission("ADMITTED") });

    await assert.rejects(
      fixture.finalizer.finalize(input()),
      (error: unknown) => error instanceof ReviewFinalizerIndeterminateError,
    );

    assert.deepEqual(fixture.events, [
      "transaction:start",
      "quotaAdmission.findFirst",
      "review.findFirst",
      "transaction:rollback",
    ]);
  });

  it("treats a soft-deleted admitted review as indeterminate", async () => {
    const fixture = createFixture({
      initialAdmission: admission("ADMITTED"),
      initialReview: review({ deletedAt: new Date("2026-08-07T00:45:00.000Z") }),
    });

    await assert.rejects(
      fixture.finalizer.finalize(input()),
      (error: unknown) => error instanceof ReviewFinalizerIndeterminateError,
    );

    assert.equal(fixture.admission.status, "ADMITTED");
    assert.equal(fixture.review?.deletedAt?.toISOString(), "2026-08-07T00:45:00.000Z");
  });

  it("rejects every non-reserved, non-admitted state without mutation", async () => {
    for (const status of ["PENDING", "DENIED", "INDETERMINATE", "RECONCILE_REQUIRED"] as const) {
      const fixture = createFixture({ initialAdmission: admission(status) });

      await assert.rejects(
        fixture.finalizer.finalize(input()),
        (error: unknown) => error instanceof ReviewFinalizerConflictError,
      );
      assert.equal(fixture.review, null);
      assert.equal(fixture.admission.status, status);
      assert.deepEqual(fixture.events, [
        "transaction:start",
        "quotaAdmission.findFirst",
        "transaction:rollback",
      ]);
    }
  });

  it("rejects mismatched review identities without creating or admitting", async () => {
    const fixture = createFixture();

    await assert.rejects(
      fixture.finalizer.finalize(input({ reviewId: "review-other" })),
      (error: unknown) => {
        assert.ok(error instanceof ReviewFinalizerConflictError);
        assert.equal(error.message.includes("review-other"), false);
        return true;
      },
    );

    assert.equal(fixture.review, null);
    assert.equal(fixture.admission.status, "RESERVED");
    assert.deepEqual(fixture.events, [
      "transaction:start",
      "quotaAdmission.findFirst",
      "transaction:rollback",
    ]);
  });

  it("treats an existing review with mismatched admission metadata as a conflict", async () => {
    const fixture = createFixture({
      initialAdmission: admission("ADMITTED"),
      initialReview: review({ mode: "QUICK" }),
    });

    await assert.rejects(
      fixture.finalizer.finalize(input()),
      (error: unknown) => error instanceof ReviewFinalizerConflictError,
    );
    assert.equal(fixture.admission.status, "ADMITTED");
  });
});
