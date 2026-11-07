import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "text";
}

export function Button({ variant = "primary", type = "button", className, ...rest }: ButtonProps) {
  const classes = `mt-button mt-button--${variant}${className === undefined ? "" : ` ${className}`}`;
  return <button {...rest} type={type} className={classes} />;
}
