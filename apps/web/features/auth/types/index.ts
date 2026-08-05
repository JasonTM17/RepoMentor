export type AuthMode = "login" | "register";

export type AuthFieldName = "displayName" | "email" | "password" | "passwordConfirmation";

export type AuthFormStatus = "idle" | "loading" | "error" | "success";

export interface AuthFormValues {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
  readonly passwordConfirmation: string;
}

export type AuthFieldErrors = Partial<Record<AuthFieldName, string>>;

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface RegisterRequest {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
}

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role?: "USER" | "ADMIN";
}

/**
 * Expected response shape for the auth API seam. The form intentionally does
 * not store the access token until the application session owner is connected.
 */
export interface AuthResponse {
  readonly accessToken?: string;
  readonly user?: AuthUser;
}

export const AUTH_GENERIC_ERROR =
  "We could not complete that request. Check your details and try again.";

export const AUTH_FIELDS_BY_MODE: Record<AuthMode, readonly AuthFieldName[]> = {
  login: ["email", "password"],
  register: ["displayName", "email", "password", "passwordConfirmation"],
};
