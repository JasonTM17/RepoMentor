import { Inject, Injectable } from "@nestjs/common";

import { getUtcDayWindow } from "./usage.date.js";
import {
  assertReviewMode,
  assertSafeOpaqueId,
  createOpaqueAdmissionId,
  hashIdempotencyKey,
} from "./quota-admission.hash.js";
import { QuotaAdmissionConflictError, QuotaAdmissionInputError } from "./quota-admission.errors.js";
import {
  QUOTA_ADMISSION_REPOSITORY,
  isQuotaAdmissionStatus,
  type QuotaAdmissionRecord,
  type QuotaAdmissionRepository,
  type QuotaAdmissionStatus,
} from "./quota-admission.types.js";

export interface CreateQuotaAdmissionIntentInput {
  readonly userId: string;
  readonly idempotencyKey: unknown;
  readonly mode: unknown;
  readonly now: Date;
  readonly admissionId?: string;
  readonly reviewId?: string;
}

export interface QuotaAdmissionIntentResult {
  readonly created: boolean;
  readonly record: QuotaAdmissionRecord;
}

@Injectable()
export class QuotaAdmissionService {
  constructor(
    @Inject(QUOTA_ADMISSION_REPOSITORY)
    private readonly repository: QuotaAdmissionRepository,
  ) {}

  async createIntent(input: CreateQuotaAdmissionIntentInput): Promise<QuotaAdmissionIntentResult> {
    const userId = assertSafeOpaqueId(input.userId, "userId");
    const mode = assertReviewMode(input.mode);
    let utcDay: string;

    try {
      utcDay = getUtcDayWindow(input.now).day;
    } catch {
      throw new QuotaAdmissionInputError("now");
    }
    const idempotencyKeyHash = hashIdempotencyKey(input.idempotencyKey);
    const admissionId = assertSafeOpaqueId(
      input.admissionId ?? createOpaqueAdmissionId(),
      "admissionId",
    );
    const reviewId = assertSafeOpaqueId(input.reviewId ?? createOpaqueAdmissionId(), "reviewId");

    const result = await this.repository.createOrGet({
      id: admissionId,
      idempotencyKeyHash,
      mode,
      now: input.now,
      reviewId,
      userId,
      utcDay,
    });

    if (result.record.mode !== mode || result.record.utcDay !== utcDay) {
      throw new QuotaAdmissionConflictError();
    }

    return result;
  }

  async findForOwner(userId: string, admissionId: string): Promise<QuotaAdmissionRecord | null> {
    return this.repository.findForOwner(
      assertSafeOpaqueId(userId, "userId"),
      assertSafeOpaqueId(admissionId, "admissionId"),
    );
  }

  async transitionForOwner(
    userId: string,
    admissionId: string,
    toStatus: QuotaAdmissionStatus,
    now = new Date(),
  ): Promise<QuotaAdmissionRecord> {
    if (!isQuotaAdmissionStatus(toStatus)) {
      throw new QuotaAdmissionInputError("toStatus");
    }

    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new QuotaAdmissionInputError("now");
    }

    return this.repository.transitionForOwner(
      assertSafeOpaqueId(userId, "userId"),
      assertSafeOpaqueId(admissionId, "admissionId"),
      toStatus,
      now,
    );
  }
}
