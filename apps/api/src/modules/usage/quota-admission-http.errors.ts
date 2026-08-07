export type QuotaAdmissionHttpErrorCode =
  | "QUOTA_ADMISSION_RATE_LIMITED"
  | "QUOTA_ADMISSION_UNAVAILABLE"
  | "QUOTA_ADMISSION_FINALIZER_CONFLICT"
  | "QUOTA_ADMISSION_FINALIZER_NOT_FOUND";

export class QuotaAdmissionHttpError extends Error {
  constructor(
    readonly code: QuotaAdmissionHttpErrorCode,
    message: string,
    name = "QuotaAdmissionHttpError",
  ) {
    super(message);
    this.name = name;
  }
}

export class QuotaAdmissionRateLimitError extends QuotaAdmissionHttpError {
  override readonly code = "QUOTA_ADMISSION_RATE_LIMITED" as const;
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      "QUOTA_ADMISSION_RATE_LIMITED",
      "The authenticated review quota has been reached.",
      "QuotaAdmissionRateLimitError",
    );
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Deliberately contains no cause, request fields, Redis keys, or secret
 * material. The transport adapter can map this stable domain error to 503.
 */
export class QuotaAdmissionUnavailableError extends QuotaAdmissionHttpError {
  override readonly code = "QUOTA_ADMISSION_UNAVAILABLE" as const;

  constructor() {
    super(
      "QUOTA_ADMISSION_UNAVAILABLE",
      "Quota admission is temporarily unavailable.",
      "QuotaAdmissionUnavailableError",
    );
  }
}

export class QuotaAdmissionFinalizerConflictError extends QuotaAdmissionHttpError {
  override readonly code = "QUOTA_ADMISSION_FINALIZER_CONFLICT" as const;

  constructor() {
    super(
      "QUOTA_ADMISSION_FINALIZER_CONFLICT",
      "Quota admission cannot be finalized in its current state.",
      "QuotaAdmissionFinalizerConflictError",
    );
  }
}

export class QuotaAdmissionFinalizerNotFoundError extends QuotaAdmissionHttpError {
  override readonly code = "QUOTA_ADMISSION_FINALIZER_NOT_FOUND" as const;

  constructor() {
    super(
      "QUOTA_ADMISSION_FINALIZER_NOT_FOUND",
      "Quota admission finalization target was not found.",
      "QuotaAdmissionFinalizerNotFoundError",
    );
  }
}
