"use client";

import { useCallback, useState } from "react";
import type { FC, InputHTMLAttributes, ReactElement } from "react";

interface PasswordFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "aria-describedby" | "aria-invalid" | "className" | "id" | "name" | "type"
> {
  readonly description: string;
  readonly error?: string | undefined;
  readonly label: string;
  readonly name: string;
}

const PasswordField: FC<PasswordFieldProps> = ({
  description,
  error,
  label,
  name,
  ...inputProps
}): ReactElement => {
  const [isVisible, setIsVisible] = useState(false);
  const fieldId = `auth-${name}`;
  const descriptionId = `${fieldId}-description`;
  const errorId = `${fieldId}-error`;
  const describedBy = [descriptionId, error ? errorId : undefined].filter(Boolean).join(" ");

  const toggleVisibility = useCallback((): void => {
    setIsVisible((current) => !current);
  }, []);

  return (
    <div className="auth-field">
      <div className="auth-field-label-row">
        <label className="auth-field-label" htmlFor={fieldId}>
          {label}
        </label>
        {inputProps.required ? (
          <span className="auth-field-required" aria-hidden="true">
            Required
          </span>
        ) : null}
      </div>
      <p className="auth-field-description" id={descriptionId}>
        {description}
      </p>
      <div className={`auth-input-wrap${error ? " auth-input-wrap-error" : ""}`}>
        <input
          {...inputProps}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className="auth-input auth-input-password"
          id={fieldId}
          name={name}
          type={isVisible ? "text" : "password"}
        />
        <button
          className="auth-password-toggle"
          type="button"
          aria-controls={fieldId}
          aria-pressed={isVisible}
          disabled={inputProps.disabled}
          onClick={toggleVisibility}
        >
          {isVisible ? "Hide" : "Show"}
        </button>
      </div>
      {error ? (
        <p className="auth-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};

export default PasswordField;
