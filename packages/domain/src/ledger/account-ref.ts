import { DomainError } from "../errors";
import { asAccountId, type AccountId } from "../ids";
import type { CurrencyCode } from "../money";

export type RealAccountKind = "bank" | "cash" | "familyCash" | "creditLiability";
export type AccountKind = RealAccountKind | "expense" | "income" | "equity";
export type AccountRef = { id: AccountId; kind: AccountKind; currency: CurrencyCode };

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function category(c: string): string {
  if (typeof c !== "string" || !KEBAB.test(c)) {
    throw new DomainError("accountInvalid", "category must be lowercase kebab-case");
  }
  return c;
}

export const nominal = {
  expense: (c: string, currency: CurrencyCode): AccountRef => ({
    id: asAccountId(`nominal:expense:${category(c)}:${currency}`),
    kind: "expense",
    currency,
  }),
  income: (c: string, currency: CurrencyCode): AccountRef => ({
    id: asAccountId(`nominal:income:${category(c)}:${currency}`),
    kind: "income",
    currency,
  }),
  openingEquity: (currency: CurrencyCode): AccountRef => ({
    id: asAccountId(`nominal:equity:opening:${currency}`),
    kind: "equity",
    currency,
  }),
  adjustmentEquity: (currency: CurrencyCode): AccountRef => ({
    id: asAccountId(`nominal:equity:adjustment:${currency}`),
    kind: "equity",
    currency,
  }),
};

export function isRealAccount(ref: AccountRef): boolean {
  return (
    ref.kind === "bank" ||
    ref.kind === "cash" ||
    ref.kind === "familyCash" ||
    ref.kind === "creditLiability"
  );
}
