import type { ReviewMode } from "../review/review.types.js";

export const QUOTA_ADMISSION_REPOSITORY = Symbol("QUOTA_ADMISSION_REPOSITORY");

export const QUOTA_ADMISSION_STATUSES = [
  "PENDING",
  "RESERVED",
  "ADMITTED",
  "DENIED",
  "INDETERMINATE",
  "RECONCILE_REQUIRED",
] as const;
export type QuotaAdmissionStatus = (typeof QUOTA_ADMISSION_STATUSES)[number];

export const QUOTA_ADMISSION_TRANSITIONS = {
  ADMITTED: [],
  DENIED: ["PENDING", "RECONCILE_REQUIRED"],
  INDETERMINATE: ["PENDING", "RESERVED"],
  PENDING: [],
  RECONCILE_REQUIRED: ["PENDING", "INDETERMINATE", "RESERVED"],
  RESERVED: ["PENDING", "INDETERMINATE", "RECONCILE_REQUIRED"],
} as const satisfies Record<QuotaAdmissionStatus, readonly QuotaAdmissionStatus[]>;

export function isQuotaAdmissionStatus(value: unknown): value is QuotaAdmissionStatus {
  return (
    typeof value === "string" && (QUOTA_ADMISSION_STATUSES as readonly string[]).includes(value)
  );
}

export function isAllowedQuotaAdmissionTransition(
  fromStatus: QuotaAdmissionStatus,
  toStatus: QuotaAdmissionStatus,
): boolean {
  return (QUOTA_ADMISSION_TRANSITIONS[toStatus] as readonly QuotaAdmissionStatus[]).includes(
    fromStatus,
  );
}

export function getAllowedQuotaAdmissionSources(
  toStatus: QuotaAdmissionStatus,
): readonly QuotaAdmissionStatus[] {
  return QUOTA_ADMISSION_TRANSITIONS[toStatus];
}

export interface QuotaAdmissionRecord {
  readonly id: string;
  readonly userId: string;
  readonly idempotencyKeyHash: string;
  readonly requestFingerprintHash?: string;
  readonly fingerprintVersion?: number;
  /** Preallocated opaque Review id; the next integration slice must finalize owner-scoped. */
  readonly reviewId: string;
  readonly mode: ReviewMode;
  readonly utcDay: string;
  readonly status: QuotaAdmissionStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateQuotaAdmissionRecordInput {
  readonly id: string;
  readonly userId: string;
  readonly idempotencyKeyHash: string;
  readonly requestFingerprintHash?: string;
  readonly fingerprintVersion?: number;
  readonly reviewId: string;
  readonly mode: ReviewMode;
  readonly utcDay: string;
  readonly now: Date;
}

export interface QuotaAdmissionCreateOrGetResult {
  readonly created: boolean;
  readonly record: QuotaAdmissionRecord;
}

export interface QuotaAdmissionRepository {
  createOrGet(input: CreateQuotaAdmissionRecordInput): Promise<QuotaAdmissionCreateOrGetResult>;
  findForOwner(userId: string, admissionId: string): Promise<QuotaAdmissionRecord | null>;
  transitionForOwner(
    userId: string,
    admissionId: string,
    toStatus: QuotaAdmissionStatus,
    now: Date,
  ): Promise<QuotaAdmissionRecord>;
}
