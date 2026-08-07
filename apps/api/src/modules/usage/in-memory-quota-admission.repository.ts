import {
  QuotaAdmissionConflictError,
  QuotaAdmissionNotFoundError,
  QuotaAdmissionTransitionError,
} from "./quota-admission.errors.js";
import { assertIdempotencyKeyHash, assertSafeOpaqueId } from "./quota-admission.hash.js";
import {
  assertQuotaAdmissionFingerprintHash,
  assertQuotaAdmissionFingerprintVersion,
} from "./quota-admission.fingerprint.js";
import {
  isAllowedQuotaAdmissionTransition,
  type CreateQuotaAdmissionRecordInput,
  type QuotaAdmissionCreateOrGetResult,
  type QuotaAdmissionRecord,
  type QuotaAdmissionRepository,
  type QuotaAdmissionStatus,
} from "./quota-admission.types.js";

function copyRecord(record: QuotaAdmissionRecord): QuotaAdmissionRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function hashKey(userId: string, idempotencyKeyHash: string): string {
  return `${userId}\u0000${idempotencyKeyHash}`;
}

export class InMemoryQuotaAdmissionRepository implements QuotaAdmissionRepository {
  private readonly byHash = new Map<string, QuotaAdmissionRecord>();
  private readonly byId = new Map<string, QuotaAdmissionRecord>();

  async createOrGet(
    input: CreateQuotaAdmissionRecordInput,
  ): Promise<QuotaAdmissionCreateOrGetResult> {
    const userId = assertSafeOpaqueId(input.userId, "userId");
    const idempotencyKeyHash = assertIdempotencyKeyHash(input.idempotencyKeyHash);
    const id = assertSafeOpaqueId(input.id, "admissionId");
    const reviewId = assertSafeOpaqueId(input.reviewId, "reviewId");
    const requestFingerprintHash =
      input.requestFingerprintHash === undefined
        ? undefined
        : assertQuotaAdmissionFingerprintHash(input.requestFingerprintHash);
    const fingerprintVersion =
      input.fingerprintVersion === undefined
        ? undefined
        : assertQuotaAdmissionFingerprintVersion(input.fingerprintVersion);
    const existing = this.byHash.get(hashKey(userId, idempotencyKeyHash));

    if (existing) {
      if (
        existing.requestFingerprintHash !== requestFingerprintHash ||
        existing.fingerprintVersion !== fingerprintVersion
      ) {
        throw new QuotaAdmissionConflictError();
      }

      return { created: false, record: copyRecord(existing) };
    }

    if (this.byId.has(id)) {
      throw new QuotaAdmissionConflictError();
    }

    const record: QuotaAdmissionRecord = {
      createdAt: new Date(input.now),
      id,
      idempotencyKeyHash,
      ...(requestFingerprintHash === undefined ? {} : { requestFingerprintHash }),
      ...(fingerprintVersion === undefined ? {} : { fingerprintVersion }),
      mode: input.mode,
      reviewId,
      status: "PENDING",
      updatedAt: new Date(input.now),
      userId,
      utcDay: input.utcDay,
    };

    this.byHash.set(hashKey(userId, idempotencyKeyHash), record);
    this.byId.set(record.id, record);
    return { created: true, record: copyRecord(record) };
  }

  async findForOwner(userId: string, admissionId: string): Promise<QuotaAdmissionRecord | null> {
    const record = this.byId.get(assertSafeOpaqueId(admissionId, "admissionId"));
    return record?.userId === assertSafeOpaqueId(userId, "userId") ? copyRecord(record) : null;
  }

  async transitionForOwner(
    userId: string,
    admissionId: string,
    toStatus: QuotaAdmissionStatus,
    now: Date,
  ): Promise<QuotaAdmissionRecord> {
    const safeUserId = assertSafeOpaqueId(userId, "userId");
    const safeAdmissionId = assertSafeOpaqueId(admissionId, "admissionId");
    const current = this.byId.get(safeAdmissionId);

    if (!current || current.userId !== safeUserId) {
      throw new QuotaAdmissionNotFoundError();
    }

    if (current.status === toStatus) {
      return copyRecord(current);
    }

    if (!isAllowedQuotaAdmissionTransition(current.status, toStatus)) {
      throw new QuotaAdmissionTransitionError(current.status, toStatus);
    }

    const updated: QuotaAdmissionRecord = {
      ...current,
      status: toStatus,
      updatedAt: new Date(now),
    };
    this.byId.set(safeAdmissionId, updated);
    return copyRecord(updated);
  }
}
