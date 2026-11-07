import type { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section";
  variant?: "default" | "inset" | "unexplained";
}

export function Card({ as: Element = "div", variant = "default", className, ...rest }: CardProps) {
  const classes = `mt-card mt-card--${variant}${className === undefined ? "" : ` ${className}`}`;
  return <Element {...rest} className={classes} />;
}
