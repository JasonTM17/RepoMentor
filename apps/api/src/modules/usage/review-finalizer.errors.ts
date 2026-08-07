export type ReviewFinalizerErrorCode =
  | "REVIEW_FINALIZER_INPUT_INVALID"
  | "REVIEW_FINALIZER_UNAVAILABLE"
  | "REVIEW_FINALIZER_INDETERMINATE"
  | "REVIEW_FINALIZER_CONFLICT"
  | "REVIEW_FINALIZER_NOT_FOUND";

export class ReviewFinalizerError extends Error {
  constructor(
    readonly code: ReviewFinalizerErrorCode,
    message: string,
    name = "ReviewFinalizerError",
  ) {
    super(message);
    this.name = name;
  }
}

export class ReviewFinalizerInputError extends ReviewFinalizerError {
  override readonly code = "REVIEW_FINALIZER_INPUT_INVALID" as const;
  readonly field: string;

  constructor(field: string) {
    super(
      "REVIEW_FINALIZER_INPUT_INVALID",
      "Invalid review finalizer input.",
      "ReviewFinalizerInputError",
    );
    this.field = field;
  }
}

export class ReviewFinalizerUnavailableError extends ReviewFinalizerError {
  override readonly code = "REVIEW_FINALIZER_UNAVAILABLE" as const;

  constructor() {
    super(
      "REVIEW_FINALIZER_UNAVAILABLE",
      "Review finalization is temporarily unavailable.",
      "ReviewFinalizerUnavailableError",
    );
  }
}

export class ReviewFinalizerIndeterminateError extends ReviewFinalizerError {
  override readonly code = "REVIEW_FINALIZER_INDETERMINATE" as const;

  constructor() {
    super(
      "REVIEW_FINALIZER_INDETERMINATE",
      "Review finalization outcome is indeterminate.",
      "ReviewFinalizerIndeterminateError",
    );
  }
}

export class ReviewFinalizerConflictError extends ReviewFinalizerError {
  override readonly code = "REVIEW_FINALIZER_CONFLICT" as const;

  constructor() {
    super(
      "REVIEW_FINALIZER_CONFLICT",
      "Review finalization conflicts with the admission state.",
      "ReviewFinalizerConflictError",
    );
  }
}

export class ReviewFinalizerNotFoundError extends ReviewFinalizerError {
  override readonly code = "REVIEW_FINALIZER_NOT_FOUND" as const;

  constructor() {
    super(
      "REVIEW_FINALIZER_NOT_FOUND",
      "Review finalization target was not found.",
      "ReviewFinalizerNotFoundError",
    );
  }
}
