import type { ReviewMode } from "../review/review.types.js";

export const USAGE_QUOTA_CONFIG = Symbol("USAGE_QUOTA_CONFIG");

export const USAGE_QUOTA_ENV_NAMES = {
  QUICK: "USER_QUICK_REVIEWS_PER_DAY",
  STANDARD: "USER_STANDARD_REVIEWS_PER_DAY",
  DEEP: "USER_DEEP_REVIEWS_PER_DAY",
} as const satisfies Record<ReviewMode, string>;

export const USAGE_DEFAULT_DAILY_LIMITS = {
  DEEP: 3,
  QUICK: 20,
  STANDARD: 10,
} as const satisfies Record<ReviewMode, number>;

export const USAGE_MAX_DAILY_LIMIT = 100_000;

export interface UsageQuotaConfig {
  readonly dailyLimits: Readonly<Record<ReviewMode, number>>;
}

export class UsageConfigError extends Error {
  readonly variableNames: readonly string[];

  constructor(variableNames: Iterable<string>) {
    const names = [...new Set(variableNames)].sort();

    super(`Invalid usage quota configuration: ${names.join(", ")}`);
    this.name = "UsageConfigError";
    this.variableNames = names;
  }
}

function parseLimit(
  variableName: string,
  rawValue: string | undefined,
  defaultValue: number,
  invalidVariables: Set<string>,
): number {
  if (rawValue === undefined) {
    return defaultValue;
  }

  const normalizedValue = rawValue.trim();

  if (!/^\d+$/u.test(normalizedValue)) {
    invalidVariables.add(variableName);
    return defaultValue;
  }

  const value = Number(normalizedValue);

  if (!Number.isSafeInteger(value) || value < 0 || value > USAGE_MAX_DAILY_LIMIT) {
    invalidVariables.add(variableName);
    return defaultValue;
  }

  return value;
}

export function parseUsageQuotaConfig(
  environment: NodeJS.ProcessEnv = process.env,
): UsageQuotaConfig {
  const invalidVariables = new Set<string>();
  const dailyLimits = {
    DEEP: parseLimit(
      USAGE_QUOTA_ENV_NAMES.DEEP,
      environment[USAGE_QUOTA_ENV_NAMES.DEEP],
      USAGE_DEFAULT_DAILY_LIMITS.DEEP,
      invalidVariables,
    ),
    QUICK: parseLimit(
      USAGE_QUOTA_ENV_NAMES.QUICK,
      environment[USAGE_QUOTA_ENV_NAMES.QUICK],
      USAGE_DEFAULT_DAILY_LIMITS.QUICK,
      invalidVariables,
    ),
    STANDARD: parseLimit(
      USAGE_QUOTA_ENV_NAMES.STANDARD,
      environment[USAGE_QUOTA_ENV_NAMES.STANDARD],
      USAGE_DEFAULT_DAILY_LIMITS.STANDARD,
      invalidVariables,
    ),
  } satisfies Record<ReviewMode, number>;

  if (invalidVariables.size > 0) {
    throw new UsageConfigError(invalidVariables);
  }

  return { dailyLimits };
}
