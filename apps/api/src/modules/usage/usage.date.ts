export interface UtcDayWindow {
  readonly day: string;
  readonly start: Date;
  readonly endExclusive: Date;
}

export function getUtcDayWindow(now: Date): UtcDayWindow {
  const timestamp = now.getTime();

  if (!Number.isFinite(timestamp)) {
    throw new RangeError("The usage clock must be a valid date.");
  }

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endExclusive = new Date(start.getTime() + 24 * 60 * 60 * 1_000);

  return {
    day: start.toISOString().slice(0, 10),
    endExclusive,
    start,
  };
}
