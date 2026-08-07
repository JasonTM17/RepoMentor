export class GuestReviewUnavailableError extends Error {
  constructor() {
    super("Guest review is temporarily unavailable.");
    this.name = "GuestReviewUnavailableError";
  }
}

export class GuestReviewRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("The guest review quota has been reached.");
    this.name = "GuestReviewRateLimitError";
    this.retryAfterSeconds = Number.isSafeInteger(retryAfterSeconds)
      ? Math.min(Math.max(retryAfterSeconds, 1), 86_400)
      : 86_400;
  }
}
