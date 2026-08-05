import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from "@/features/auth/types";

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/+$/u, "") ?? "";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;
const maxAccessTokenLength = 4_096;
const maxDisplayNameLength = 80;
const maxEmailLength = 254;
const maxUserIdLength = 64;

export class AuthClientError extends Error {
  public readonly status: number;

  public constructor(status: number) {
    super("Authentication request failed.");
    this.name = "AuthClientError";
    this.status = status;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => hasOwn(value, key));

const isBoundedString = (value: unknown, maximum: number): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= maximum &&
  value === value.trim();

const isAuthEmail = (value: unknown): value is string =>
  isBoundedString(value, maxEmailLength) &&
  value === value.toLowerCase() &&
  emailPattern.test(value);

const isAuthTimestamp = (value: unknown): value is string =>
  typeof value === "string" && timestampPattern.test(value) && !Number.isNaN(Date.parse(value));

const isAuthUser = (value: unknown): value is LoginResponse["user"] => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    hasExactKeys(value, [
      "id",
      "email",
      "displayName",
      "role",
      "status",
      "createdAt",
      "updatedAt",
    ]) &&
    isBoundedString(value.id, maxUserIdLength) &&
    isAuthEmail(value.email) &&
    isBoundedString(value.displayName, maxDisplayNameLength) &&
    (value.role === "USER" || value.role === "ADMIN") &&
    (value.status === "ACTIVE" || value.status === "DISABLED") &&
    isAuthTimestamp(value.createdAt) &&
    isAuthTimestamp(value.updatedAt)
  );
};

const isRegisterResponse = (value: unknown): value is RegisterResponse =>
  isRecord(value) && hasExactKeys(value, ["accepted"]) && value.accepted === true;

const isLoginResponse = (value: unknown): value is LoginResponse =>
  isRecord(value) &&
  hasExactKeys(value, ["accessToken", "tokenType", "expiresInSeconds", "user"]) &&
  isBoundedString(value.accessToken, maxAccessTokenLength) &&
  value.tokenType === "Bearer" &&
  typeof value.expiresInSeconds === "number" &&
  Number.isInteger(value.expiresInSeconds) &&
  value.expiresInSeconds > 0 &&
  value.expiresInSeconds <= 3_600 &&
  isAuthUser(value.user) &&
  !hasOwn(value, "refreshToken");

const parseSuccessEnvelope = <TResponse>(
  body: unknown,
  parseData: (value: unknown) => value is TResponse,
): TResponse | undefined => {
  if (!isRecord(body) || !hasOwn(body, "data") || !parseData(body.data)) {
    return undefined;
  }

  return body.data;
};

const postAuth = async <TResponse>(
  endpoint: "login" | "register",
  payload: LoginRequest | RegisterRequest,
  expectedStatus: 201 | 202,
  parseData: (value: unknown) => value is TResponse,
): Promise<TResponse> => {
  const response = await fetch(`${apiOrigin}/api/v1/auth/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok || response.status !== expectedStatus) {
    throw new AuthClientError(response.status);
  }

  const parsedResponse = parseSuccessEnvelope(body, parseData);

  if (!parsedResponse) {
    throw new AuthClientError(response.status);
  }

  return parsedResponse;
};

/**
 * The API owns the refresh cookie. This client validates the response envelope
 * and never writes access or refresh tokens to browser storage.
 */
export const authClient = Object.freeze({
  login: (payload: LoginRequest): Promise<LoginResponse> =>
    postAuth("login", payload, 201, isLoginResponse),
  register: (payload: RegisterRequest): Promise<RegisterResponse> =>
    postAuth("register", payload, 202, isRegisterResponse),
});
