import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "text";
}

export function Button({ variant = "primary", type = "button", ...rest }: ButtonProps) {
  return <button {...rest} type={type} className={`mt-button mt-button--${variant}`} />;
}
