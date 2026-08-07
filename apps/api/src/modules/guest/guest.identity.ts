import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import {
  GUEST_IDENTITY_SECRET_MAX_BYTES,
  GUEST_IDENTITY_SECRET_MIN_BYTES,
} from "./guest.config.js";

export const GUEST_IDENTITY_HASH_ALGORITHM = "sha256" as const;
export const GUEST_IDENTITY_HASH_PATTERN = /^[a-f0-9]{64}$/u;

export class GuestIdentityUnavailableError extends Error {
  constructor() {
    super("Guest identity is unavailable.");
    this.name = "GuestIdentityUnavailableError";
  }
}

function isUsableRemoteAddress(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && isIP(value) !== 0;
}

function isUsableSecret(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }

  const bytes = Buffer.byteLength(value, "utf8");
  return bytes >= GUEST_IDENTITY_SECRET_MIN_BYTES && bytes <= GUEST_IDENTITY_SECRET_MAX_BYTES;
}

/**
 * Turns only the socket-provided address into a bounded Redis-safe identity.
 * Callers must not pass proxy headers, cookies, tokens, or client metadata.
 */
export function deriveGuestIdentity(remoteAddress: unknown, secret: unknown): string {
  if (!isUsableRemoteAddress(remoteAddress) || !isUsableSecret(secret)) {
    throw new GuestIdentityUnavailableError();
  }

  const identity = createHmac(GUEST_IDENTITY_HASH_ALGORITHM, secret)
    .update(remoteAddress, "utf8")
    .digest("hex");

  if (!GUEST_IDENTITY_HASH_PATTERN.test(identity)) {
    throw new GuestIdentityUnavailableError();
  }

  return identity;
}
