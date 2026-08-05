import type {
  AuthFieldErrors,
  AuthFieldName,
  AuthFormValues,
  AuthMode,
} from "@/features/auth/types";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const maxDisplayNameLength = 80;
const minimumPasswordLength = 12;

export const validateAuthField = (
  field: AuthFieldName,
  value: string,
  values: AuthFormValues,
  mode: AuthMode,
): string | undefined => {
  if (field === "displayName") {
    if (mode === "login") {
      return undefined;
    }

    if (value.trim().length === 0) {
      return "Enter a display name.";
    }

    if (value.trim().length > maxDisplayNameLength) {
      return "Use 80 characters or fewer.";
    }

    return undefined;
  }

  if (field === "email") {
    if (value.trim().length === 0) {
      return "Enter your email address.";
    }

    if (!emailPattern.test(value.trim())) {
      return "Use a valid email address.";
    }

    return undefined;
  }

  if (field === "password") {
    if (value.length === 0) {
      return "Enter your password.";
    }

    if (value.length < minimumPasswordLength) {
      return `Use at least ${minimumPasswordLength} characters.`;
    }

    return undefined;
  }

  if (field === "passwordConfirmation") {
    if (mode === "login") {
      return undefined;
    }

    if (value.length === 0) {
      return "Re-enter your password.";
    }

    if (value !== values.password) {
      return "Passwords must match.";
    }
  }

  return undefined;
};

export const validateAuthForm = (values: AuthFormValues, mode: AuthMode): AuthFieldErrors => {
  const fields: readonly AuthFieldName[] =
    mode === "login"
      ? ["email", "password"]
      : ["displayName", "email", "password", "passwordConfirmation"];

  return fields.reduce<AuthFieldErrors>((errors, field) => {
    const error = validateAuthField(field, values[field], values, mode);

    if (error) {
      errors[field] = error;
    }

    return errors;
  }, {});
};
