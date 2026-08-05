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

export type AuthUserRole = "USER" | "ADMIN";

export type AuthUserStatus = "ACTIVE" | "DISABLED";

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: AuthUserRole;
  readonly status: AuthUserStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RegisterResponse {
  readonly accepted: true;
}

export interface LoginResponse {
  readonly accessToken: string;
  readonly tokenType: "Bearer";
  readonly expiresInSeconds: number;
  readonly user: AuthUser;
}

export type AuthResponse = LoginResponse | RegisterResponse;

export const AUTH_GENERIC_ERROR =
  "We could not complete that request. Check your details and try again.";

export const AUTH_FIELDS_BY_MODE: Record<AuthMode, readonly AuthFieldName[]> = {
  login: ["email", "password"],
  register: ["displayName", "email", "password", "passwordConfirmation"],
};
