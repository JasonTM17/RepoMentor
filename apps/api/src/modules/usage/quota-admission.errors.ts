import type { QuotaAdmissionStatus } from "./quota-admission.types.js";

export class QuotaAdmissionInputError extends Error {
  readonly code = "QUOTA_ADMISSION_INPUT_INVALID" as const;
  readonly field: string;

  constructor(field: string) {
    super("Invalid quota admission input.");
    this.name = "QuotaAdmissionInputError";
    this.field = field;
  }
}

export class QuotaAdmissionConflictError extends Error {
  readonly code = "QUOTA_ADMISSION_IDEMPOTENCY_CONFLICT" as const;

  constructor() {
    super("Quota admission idempotency conflict.");
    this.name = "QuotaAdmissionConflictError";
  }
}

export class QuotaAdmissionNotFoundError extends Error {
  readonly code = "QUOTA_ADMISSION_NOT_FOUND" as const;

  constructor() {
    super("Quota admission not found.");
    this.name = "QuotaAdmissionNotFoundError";
  }
}

export class QuotaAdmissionTransitionError extends Error {
  readonly code = "QUOTA_ADMISSION_TRANSITION_INVALID" as const;
  readonly fromStatus: QuotaAdmissionStatus;
  readonly toStatus: QuotaAdmissionStatus;

  constructor(fromStatus: QuotaAdmissionStatus, toStatus: QuotaAdmissionStatus) {
    super("Quota admission transition is not allowed.");
    this.name = "QuotaAdmissionTransitionError";
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}
