import type { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section";
  variant?: "default" | "inset" | "unexplained";
}

export function Card({ as: Element = "div", variant = "default", ...rest }: CardProps) {
  return <Element {...rest} className={`mt-card mt-card--${variant}`} />;
}
