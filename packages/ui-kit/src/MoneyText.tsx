export interface MoneyTextProps {
  /** Already formatted, normally by `formatBdt` from contracts; ui-kit depends on React only. */
  text: string;
  variant?: "default" | "unexplained";
}

export function MoneyText({ text, variant = "default" }: MoneyTextProps) {
  return <span className={`mt-money mt-money--${variant}`}>{text}</span>;
}
