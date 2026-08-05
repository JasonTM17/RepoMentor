import type { FC, InputHTMLAttributes, ReactElement } from "react";

interface AuthFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "aria-describedby" | "aria-invalid" | "className" | "id" | "name"
> {
  readonly description: string;
  readonly error?: string | undefined;
  readonly label: string;
  readonly name: string;
}

const AuthField: FC<AuthFieldProps> = ({
  description,
  error,
  label,
  name,
  ...inputProps
}): ReactElement => {
  const fieldId = `auth-${name}`;
  const descriptionId = `${fieldId}-description`;
  const errorId = `${fieldId}-error`;
  const describedBy = [descriptionId, error ? errorId : undefined].filter(Boolean).join(" ");

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
      <input
        {...inputProps}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={`auth-input${error ? " auth-input-error" : ""}`}
        id={fieldId}
        name={name}
      />
      {error ? (
        <p className="auth-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};

export default AuthField;
