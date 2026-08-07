import {
  QUOTA_ADMISSION_FINGERPRINT_MAX_SECRET_BYTES,
  QUOTA_ADMISSION_FINGERPRINT_MIN_SECRET_BYTES,
} from "./quota-admission.fingerprint.js";

export const QUOTA_ADMISSION_FINGERPRINT_CONFIG = Symbol("QUOTA_ADMISSION_FINGERPRINT_CONFIG");

export const QUOTA_ADMISSION_FINGERPRINT_ENV_NAMES = {
  SECRET: "QUOTA_ADMISSION_FINGERPRINT_SECRET",
} as const;

export const QUOTA_ADMISSION_FINGERPRINT_SECRET_ENV_NAME =
  QUOTA_ADMISSION_FINGERPRINT_ENV_NAMES.SECRET;

export interface QuotaAdmissionFingerprintConfig {
  readonly fingerprintSecret: string;
}

export interface QuotaAdmissionFingerprintConfigOptions {
  /** A test-only override; production configuration must come from the environment. */
  readonly testSecret?: string;
}

export class QuotaAdmissionFingerprintConfigError extends Error {
  readonly variableNames: readonly string[];

  constructor(variableNames: Iterable<string>) {
    const names = [...new Set(variableNames)].sort();

    super(`Invalid quota admission fingerprint configuration: ${names.join(", ")}`);
    this.name = "QuotaAdmissionFingerprintConfigError";
    this.variableNames = names;
  }
}

function parseSecret(rawValue: unknown, invalidVariables: Set<string>): string | undefined {
  if (typeof rawValue !== "string") {
    invalidVariables.add(QUOTA_ADMISSION_FINGERPRINT_SECRET_ENV_NAME);
    return undefined;
  }

  const secretBytes = Buffer.byteLength(rawValue, "utf8");

  if (
    secretBytes < QUOTA_ADMISSION_FINGERPRINT_MIN_SECRET_BYTES ||
    secretBytes > QUOTA_ADMISSION_FINGERPRINT_MAX_SECRET_BYTES
  ) {
    invalidVariables.add(QUOTA_ADMISSION_FINGERPRINT_SECRET_ENV_NAME);
    return undefined;
  }

  return rawValue;
}

export function parseQuotaAdmissionFingerprintConfig(
  environment: NodeJS.ProcessEnv = process.env,
  options: QuotaAdmissionFingerprintConfigOptions = {},
): QuotaAdmissionFingerprintConfig {
  const invalidVariables = new Set<string>();
  const isTestEnvironment = environment.NODE_ENV === "test";
  const hasTestInjection = Object.prototype.hasOwnProperty.call(options, "testSecret");

  if (hasTestInjection && !isTestEnvironment) {
    invalidVariables.add(QUOTA_ADMISSION_FINGERPRINT_SECRET_ENV_NAME);
  }

  const rawSecret =
    isTestEnvironment && hasTestInjection
      ? options.testSecret
      : environment[QUOTA_ADMISSION_FINGERPRINT_SECRET_ENV_NAME];
  const fingerprintSecret = parseSecret(rawSecret, invalidVariables);

  if (invalidVariables.size > 0 || fingerprintSecret === undefined) {
    if (fingerprintSecret === undefined) {
      invalidVariables.add(QUOTA_ADMISSION_FINGERPRINT_SECRET_ENV_NAME);
    }

    throw new QuotaAdmissionFingerprintConfigError(invalidVariables);
  }

  return { fingerprintSecret };
}
