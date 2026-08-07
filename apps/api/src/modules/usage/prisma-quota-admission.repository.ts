import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../auth/prisma.service.js";
import {
  QuotaAdmissionConflictError,
  QuotaAdmissionInputError,
  QuotaAdmissionNotFoundError,
  QuotaAdmissionTransitionError,
} from "./quota-admission.errors.js";
import { assertIdempotencyKeyHash, assertSafeOpaqueId } from "./quota-admission.hash.js";
import {
  getAllowedQuotaAdmissionSources,
  isQuotaAdmissionStatus,
  type CreateQuotaAdmissionRecordInput,
  type QuotaAdmissionCreateOrGetResult,
  type QuotaAdmissionRecord,
  type QuotaAdmissionRepository,
  type QuotaAdmissionStatus,
} from "./quota-admission.types.js";

type QuotaAdmissionRow = Prisma.QuotaAdmissionGetPayload<Record<string, never>>;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "P2002"
  );
}

function toUtcDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function mapRow(row: QuotaAdmissionRow): QuotaAdmissionRecord {
  return {
    createdAt: row.createdAt,
    id: row.id,
    idempotencyKeyHash: row.idempotencyKeyHash,
    mode: row.mode,
    reviewId: row.reviewId,
    status: row.status,
    updatedAt: row.updatedAt,
    userId: row.userId,
    utcDay: toUtcDay(row.utcDay),
  };
}

@Injectable()
export class PrismaQuotaAdmissionRepository implements QuotaAdmissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createOrGet(
    input: CreateQuotaAdmissionRecordInput,
  ): Promise<QuotaAdmissionCreateOrGetResult> {
    const existing = await this.findByOwnerAndHash(input.userId, input.idempotencyKeyHash);

    if (existing) {
      return { created: false, record: existing };
    }

    try {
      const row = await this.prisma.transaction((transaction) =>
        transaction.quotaAdmission.create({
          data: {
            id: assertSafeOpaqueId(input.id, "admissionId"),
            idempotencyKeyHash: assertIdempotencyKeyHash(input.idempotencyKeyHash),
            mode: input.mode,
            reviewId: assertSafeOpaqueId(input.reviewId, "reviewId"),
            updatedAt: input.now,
            userId: input.userId,
            utcDay: new Date(`${input.utcDay}T00:00:00.000Z`),
          },
        }),
      );

      return { created: true, record: mapRow(row) };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      const raced = await this.findByOwnerAndHash(input.userId, input.idempotencyKeyHash);

      if (raced) {
        return { created: false, record: raced };
      }

      throw new QuotaAdmissionConflictError();
    }
  }

  async findForOwner(userId: string, admissionId: string): Promise<QuotaAdmissionRecord | null> {
    const safeUserId = assertSafeOpaqueId(userId, "userId");
    const safeAdmissionId = assertSafeOpaqueId(admissionId, "admissionId");

    return this.prisma.transaction(async (transaction) => {
      const row = await transaction.quotaAdmission.findFirst({
        where: { id: safeAdmissionId, userId: safeUserId },
      });

      return row ? mapRow(row) : null;
    });
  }

  async transitionForOwner(
    userId: string,
    admissionId: string,
    toStatus: QuotaAdmissionStatus,
    now: Date,
  ): Promise<QuotaAdmissionRecord> {
    const safeUserId = assertSafeOpaqueId(userId, "userId");
    const safeAdmissionId = assertSafeOpaqueId(admissionId, "admissionId");

    if (!isQuotaAdmissionStatus(toStatus)) {
      throw new QuotaAdmissionInputError("toStatus");
    }

    return this.prisma.transaction(async (transaction) => {
      const updated = await transaction.quotaAdmission.updateMany({
        data: { status: toStatus, updatedAt: now },
        where: {
          id: safeAdmissionId,
          status: { in: [...getAllowedQuotaAdmissionSources(toStatus)] },
          userId: safeUserId,
        },
      });

      if (updated.count === 1) {
        const row = await transaction.quotaAdmission.findFirst({
          where: { id: safeAdmissionId, userId: safeUserId },
        });

        if (row) {
          return mapRow(row);
        }
      }

      const current = await transaction.quotaAdmission.findFirst({
        where: { id: safeAdmissionId, userId: safeUserId },
      });

      if (!current) {
        throw new QuotaAdmissionNotFoundError();
      }

      if (current.status === toStatus) {
        return mapRow(current);
      }

      throw new QuotaAdmissionTransitionError(current.status, toStatus);
    });
  }

  private async findByOwnerAndHash(
    userId: string,
    idempotencyKeyHash: string,
  ): Promise<QuotaAdmissionRecord | null> {
    const safeUserId = assertSafeOpaqueId(userId, "userId");
    const safeHash = assertIdempotencyKeyHash(idempotencyKeyHash);
    const row = await this.prisma.transaction((transaction) =>
      transaction.quotaAdmission.findUnique({
        where: {
          userId_idempotencyKeyHash: {
            idempotencyKeyHash: safeHash,
            userId: safeUserId,
          },
        },
      }),
    );

    return row ? mapRow(row) : null;
  }
}
