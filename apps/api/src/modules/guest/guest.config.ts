export const GUEST_IDENTITY_CONFIG = Symbol("GUEST_IDENTITY_CONFIG");

export const GUEST_IDENTITY_SECRET_ENV_NAME = "GUEST_IDENTITY_SECRET" as const;
export const GUEST_IDENTITY_SECRET_MIN_BYTES = 32;
export const GUEST_IDENTITY_SECRET_MAX_BYTES = 4_096;

export interface GuestIdentityConfig {
  readonly secret: string | undefined;
}

/**
 * Resolves guest identity configuration without failing application bootstrap.
 * An absent or malformed secret is represented as unavailable and is rejected
 * at the guest request boundary without echoing configuration values.
 */
export function resolveGuestIdentityConfig(
  environment: NodeJS.ProcessEnv = process.env,
): GuestIdentityConfig {
  const configuredSecret = environment[GUEST_IDENTITY_SECRET_ENV_NAME];

  if (typeof configuredSecret !== "string") {
    return { secret: undefined };
  }

  const secret = configuredSecret.trim();
  const secretBytes = Buffer.byteLength(secret, "utf8");

  if (
    secretBytes < GUEST_IDENTITY_SECRET_MIN_BYTES ||
    secretBytes > GUEST_IDENTITY_SECRET_MAX_BYTES
  ) {
    return { secret: undefined };
  }

  return { secret };
}
