import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from "@/features/auth/types";

export interface AuthSessionSnapshot {
  readonly accessToken?: string;
}

type AuthSessionListener = () => void;

let accessToken: string | undefined;
let authSessionSnapshot: AuthSessionSnapshot = Object.freeze({});
const authSessionListeners = new Set<AuthSessionListener>();
let refreshAttempted = false;
let refreshPromise: Promise<void> | undefined;

export const getAccessToken = (): string | undefined => accessToken;

export const getAuthSessionSnapshot = (): AuthSessionSnapshot => authSessionSnapshot;

export const subscribeAuthSession = (listener: AuthSessionListener): (() => void) => {
  authSessionListeners.add(listener);
  return () => {
    authSessionListeners.delete(listener);
  };
};

export const setAccessToken = (nextAccessToken: string): void => {
  if (accessToken === nextAccessToken) {
    return;
  }

  accessToken = nextAccessToken;
  refreshAttempted = true;
  authSessionSnapshot = Object.freeze({ accessToken: nextAccessToken });
  authSessionListeners.forEach((listener) => listener());
};

export const clearAccessToken = (): void => {
  if (accessToken === undefined) {
    return;
  }

  accessToken = undefined;
  authSessionSnapshot = Object.freeze({});
  authSessionListeners.forEach((listener) => listener());
};

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/+$/u, "") ?? "";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;
const maxAccessTokenLength = 4_096;
const maxDisplayNameLength = 80;
const maxEmailLength = 254;
const maxUserIdLength = 64;
const maxRequestIdLength = 128;
const maxPageSize = 100;

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

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

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

interface AuthApiMeta {
  readonly requestId?: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly total?: number;
}

interface AuthSuccessEnvelope {
  readonly data: unknown;
  readonly meta?: AuthApiMeta;
}

const isApiMeta = (value: unknown): value is AuthApiMeta => {
  if (!isRecord(value) || !hasOnlyKeys(value, ["requestId", "page", "pageSize", "total"])) {
    return false;
  }

  return (
    (!hasOwn(value, "requestId") || isBoundedString(value.requestId, maxRequestIdLength)) &&
    (!hasOwn(value, "page") ||
      (typeof value.page === "number" && Number.isInteger(value.page) && value.page > 0)) &&
    (!hasOwn(value, "pageSize") ||
      (typeof value.pageSize === "number" &&
        Number.isInteger(value.pageSize) &&
        value.pageSize > 0 &&
        value.pageSize <= maxPageSize)) &&
    (!hasOwn(value, "total") ||
      (typeof value.total === "number" && Number.isInteger(value.total) && value.total >= 0))
  );
};

const isSuccessEnvelope = (value: unknown): value is AuthSuccessEnvelope =>
  isRecord(value) &&
  hasOwn(value, "data") &&
  hasOnlyKeys(value, ["data", "meta"]) &&
  (!hasOwn(value, "meta") || isApiMeta(value.meta));

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
  if (!isSuccessEnvelope(body) || !parseData(body.data)) {
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

export const refreshAccessToken = (): Promise<void> => {
  if (accessToken !== undefined) {
    return Promise.resolve();
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  if (refreshAttempted) {
    return Promise.resolve();
  }

  refreshAttempted = true;
  refreshPromise = (async () => {
    let response: Response;

    try {
      response = await fetch(`${apiOrigin}/api/v1/auth/refresh`, {
        credentials: "include",
        method: "POST",
      });
    } catch {
      return;
    }

    let body: unknown;

    try {
      body = await response.json();
    } catch {
      body = undefined;
    }

    if (!response.ok || response.status !== 201) {
      return;
    }

    const parsedResponse = parseSuccessEnvelope(body, isLoginResponse);

    if (parsedResponse) {
      setAccessToken(parsedResponse.accessToken);
    }
  })().finally(() => {
    refreshPromise = undefined;
  });

  return refreshPromise;
};

/**
 * The API owns the refresh cookie. This client validates the response envelope
 * and never writes access or refresh tokens to browser storage.
 */
export const authClient = Object.freeze({
  login: async (payload: LoginRequest): Promise<LoginResponse> => {
    const response = await postAuth("login", payload, 201, isLoginResponse);
    setAccessToken(response.accessToken);
    return response;
  },
  register: (payload: RegisterRequest): Promise<RegisterResponse> =>
    postAuth("register", payload, 202, isRegisterResponse),
});
