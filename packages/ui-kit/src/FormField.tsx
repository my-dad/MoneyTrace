import { useId, type ReactNode } from "react";

export interface FormControlProps {
  id: string;
  className: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

export interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  /** Spread these onto the input or select. */
  children: (control: FormControlProps) => ReactNode;
}

export function FormField({ label, hint, error, children }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint === undefined ? null : hintId, error === undefined ? null : errorId]
    .filter((part) => part !== null)
    .join(" ");

  return (
    <div className="mt-field">
      <label htmlFor={id} className="mt-field__label">
        {label}
      </label>
      {children({
        id,
        className: "mt-input",
        ...(describedBy === "" ? {} : { "aria-describedby": describedBy }),
        ...(error === undefined ? {} : { "aria-invalid": true as const }),
      })}
      {hint !== undefined && (
        <p id={hintId} className="mt-field__hint">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} className="mt-field__error">
          {error}
        </p>
      )}
    </div>
  );
}
