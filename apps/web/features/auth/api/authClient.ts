import type { AuthResponse, LoginRequest, RegisterRequest } from "@/features/auth/types";

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/+$/u, "") ?? "";

export class AuthClientError extends Error {
  public readonly status: number;

  public constructor(status: number) {
    super("Authentication request failed.");
    this.name = "AuthClientError";
    this.status = status;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const unwrapEnvelope = <TResponse>(body: unknown): TResponse => {
  if (isRecord(body) && "data" in body) {
    return body.data as TResponse;
  }

  return body as TResponse;
};

const postAuth = async <TResponse>(
  endpoint: "login" | "register",
  payload: LoginRequest | RegisterRequest,
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

  if (!response.ok) {
    throw new AuthClientError(response.status);
  }

  return unwrapEnvelope<TResponse>(body);
};

/**
 * Pending server seam for Phase 04. The API worker owns these routes and the
 * server owns the HttpOnly refresh cookie. This client does not persist tokens.
 */
export const authClient = Object.freeze({
  login: (payload: LoginRequest): Promise<AuthResponse> => postAuth<AuthResponse>("login", payload),
  register: (payload: RegisterRequest): Promise<AuthResponse> =>
    postAuth<AuthResponse>("register", payload),
});
