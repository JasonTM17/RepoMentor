const MAX_COOKIE_VALUE_LENGTH = 4_096;

export function readCookie(
  rawCookieHeader: string | string[] | undefined,
  cookieName: string,
): string | undefined {
  if (typeof rawCookieHeader !== "string") {
    return undefined;
  }

  for (const rawCookie of rawCookieHeader.split(";")) {
    const separatorIndex = rawCookie.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const name = rawCookie.slice(0, separatorIndex).trim();

    if (name !== cookieName) {
      continue;
    }

    const value = rawCookie.slice(separatorIndex + 1).trim();

    if (value.length > MAX_COOKIE_VALUE_LENGTH) {
      return undefined;
    }

    return value || undefined;
  }

  return undefined;
}
