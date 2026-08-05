import { randomBytes, randomInt } from "node:crypto";

const CUID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const CUID_COUNTER_LIMIT = 36 ** 4;
export const AUTH_IDENTIFIER_PATTERN = /^c[a-z0-9]{24}$/;
let counter = randomInt(CUID_COUNTER_LIMIT);

function randomCuidCharacters(length: number): string {
  let value = "";

  while (value.length < length) {
    const bytes = randomBytes(length);

    for (const byte of bytes) {
      value += CUID_ALPHABET[byte % CUID_ALPHABET.length];

      if (value.length === length) {
        break;
      }
    }
  }

  return value;
}

export function createAuthId(now = Date.now()): string {
  const timestamp = now.toString(36).padStart(8, "0").slice(-8);
  const currentCounter = (counter++ % CUID_COUNTER_LIMIT).toString(36).padStart(4, "0");

  return `c${timestamp}${currentCounter}${randomCuidCharacters(12)}`;
}

export function isAuthIdentifier(value: unknown): value is string {
  return typeof value === "string" && AUTH_IDENTIFIER_PATTERN.test(value);
}
