import type { ReviewMode } from "../review/review.types.js";

export const USAGE_QUOTA_CONFIG = Symbol("USAGE_QUOTA_CONFIG");
export const USAGE_REDIS_CONFIG = Symbol("USAGE_REDIS_CONFIG");

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

export const USAGE_REDIS_ENV_NAMES = {
  GUEST_QUICK: "GUEST_QUICK_REVIEWS_PER_DAY",
  QUOTA_TTL_MAX_SECONDS: "USAGE_REDIS_QUOTA_TTL_MAX_SECONDS",
  LOCK_TTL_MS: "USAGE_REDIS_LOCK_TTL_MS",
} as const;

export const USAGE_DEFAULT_REDIS_CONFIG = {
  guestQuickLimit: 3,
  quotaTtlMaxSeconds: 86_400,
  lockTtlMs: 10_000,
} as const;

export const USAGE_REDIS_LIMITS = {
  minQuotaTtlSeconds: 1,
  maxQuotaTtlSeconds: 86_400,
  minLockTtlMs: 1_000,
  maxLockTtlMs: 60_000,
} as const;

export interface UsageQuotaConfig {
  readonly dailyLimits: Readonly<Record<ReviewMode, number>>;
}

export interface UsageRedisConfig {
  readonly authenticatedDailyLimits: Readonly<Record<ReviewMode, number>>;
  readonly guestQuickLimit: number;
  readonly quotaTtlMaxSeconds: number;
  readonly lockTtlMs: number;
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

export class UsageRedisConfigError extends Error {
  readonly variableNames: readonly string[];

  constructor(variableNames: Iterable<string>) {
    const names = [...new Set(variableNames)].sort();

    super(`Invalid usage Redis configuration: ${names.join(", ")}`);
    this.name = "UsageRedisConfigError";
    this.variableNames = names;
  }
}

function parseBoundedInteger(
  variableName: string,
  rawValue: string | undefined,
  defaultValue: number,
  minimum: number,
  maximum: number,
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

  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    invalidVariables.add(variableName);
    return defaultValue;
  }

  return value;
}

function parseLimit(
  variableName: string,
  rawValue: string | undefined,
  defaultValue: number,
  invalidVariables: Set<string>,
): number {
  return parseBoundedInteger(
    variableName,
    rawValue,
    defaultValue,
    0,
    USAGE_MAX_DAILY_LIMIT,
    invalidVariables,
  );
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

export function parseUsageRedisConfig(
  environment: NodeJS.ProcessEnv = process.env,
): UsageRedisConfig {
  const quotaConfig = parseUsageQuotaConfig(environment);
  const invalidVariables = new Set<string>();

  const guestQuickLimit = parseBoundedInteger(
    USAGE_REDIS_ENV_NAMES.GUEST_QUICK,
    environment[USAGE_REDIS_ENV_NAMES.GUEST_QUICK],
    USAGE_DEFAULT_REDIS_CONFIG.guestQuickLimit,
    0,
    USAGE_MAX_DAILY_LIMIT,
    invalidVariables,
  );
  const quotaTtlMaxSeconds = parseBoundedInteger(
    USAGE_REDIS_ENV_NAMES.QUOTA_TTL_MAX_SECONDS,
    environment[USAGE_REDIS_ENV_NAMES.QUOTA_TTL_MAX_SECONDS],
    USAGE_DEFAULT_REDIS_CONFIG.quotaTtlMaxSeconds,
    USAGE_REDIS_LIMITS.minQuotaTtlSeconds,
    USAGE_REDIS_LIMITS.maxQuotaTtlSeconds,
    invalidVariables,
  );
  const lockTtlMs = parseBoundedInteger(
    USAGE_REDIS_ENV_NAMES.LOCK_TTL_MS,
    environment[USAGE_REDIS_ENV_NAMES.LOCK_TTL_MS],
    USAGE_DEFAULT_REDIS_CONFIG.lockTtlMs,
    USAGE_REDIS_LIMITS.minLockTtlMs,
    USAGE_REDIS_LIMITS.maxLockTtlMs,
    invalidVariables,
  );

  if (invalidVariables.size > 0) {
    throw new UsageRedisConfigError(invalidVariables);
  }

  return {
    authenticatedDailyLimits: quotaConfig.dailyLimits,
    guestQuickLimit,
    quotaTtlMaxSeconds,
    lockTtlMs,
  };
}
