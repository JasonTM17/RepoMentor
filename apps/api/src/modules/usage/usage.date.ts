export interface UtcDayWindow {
  readonly day: string;
  readonly start: Date;
  readonly endExclusive: Date;
}

const STRICT_UTC_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/u;

/**
 * Parses only an explicit UTC ISO date-time and rejects calendar overflows.
 * Date.parse alone is intentionally not used because runtimes may normalize
 * invalid calendar dates instead of rejecting them.
 */
export function parseStrictUtcDateTime(value: unknown): Date | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const match = STRICT_UTC_DATE_TIME_PATTERN.exec(value);

  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number(match[7] ?? "0");
  const date = new Date(0);

  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);

  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second ||
    date.getUTCMilliseconds() !== millisecond
  ) {
    return undefined;
  }

  return date;
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
