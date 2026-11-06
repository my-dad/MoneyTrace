import { DomainError } from "./errors";

export type CurrencyCode = "BDT";

// CurrencyCode is a single-member union today; widen so comparisons stay valid when more are added.
const widen = (c: string): string => c;

function checked(n: number, what: string): number {
  if (typeof n !== "number" || !Number.isSafeInteger(n)) {
    throw new DomainError("invalidMoney", `${what} must be a safe integer`);
  }
  // Normalize -0 to 0.
  return n === 0 ? 0 : n;
}

export class Money {
  readonly minor: number;
  readonly currency: CurrencyCode;

  private constructor(minor: number, currency: CurrencyCode) {
    this.minor = minor;
    this.currency = currency;
    Object.freeze(this);
  }

  static ofMinor(minor: number, currency: CurrencyCode): Money {
    return new Money(checked(minor, "minor"), currency);
  }

  private assertSame(o: Money): void {
    if (widen(o.currency) !== widen(this.currency)) {
      throw new DomainError(
        "currencyMismatch",
        `cannot combine ${widen(this.currency)} with ${widen(o.currency)}`,
      );
    }
  }

  add(o: Money): Money {
    this.assertSame(o);
    return new Money(checked(this.minor + o.minor, "sum"), this.currency);
  }

  subtract(o: Money): Money {
    this.assertSame(o);
    return new Money(checked(this.minor - o.minor, "difference"), this.currency);
  }

  negate(): Money {
    return new Money(checked(-this.minor, "negation"), this.currency);
  }

  isZero(): boolean {
    return this.minor === 0;
  }

  isPositive(): boolean {
    return this.minor > 0;
  }

  isNegative(): boolean {
    return this.minor < 0;
  }

  equals(o: Money): boolean {
    return widen(this.currency) === widen(o.currency) && this.minor === o.minor;
  }

  /** Splits exactly by integer ratios, largest remainder first (ties to the earlier index). */
  allocate(ratios: readonly number[]): Money[] {
    if (ratios.length === 0) {
      throw new DomainError("invalidMoney", "ratios must not be empty");
    }
    let total = 0n;
    for (const r of ratios) {
      if (typeof r !== "number" || !Number.isSafeInteger(r) || r < 0) {
        throw new DomainError("invalidMoney", "ratios must be non-negative safe integers");
      }
      total += BigInt(r);
    }
    if (total === 0n) {
      throw new DomainError("invalidMoney", "ratios must not all be zero");
    }

    const negative = this.minor < 0;
    const amount = BigInt(negative ? -this.minor : this.minor);
    const shares = ratios.map((r) => (amount * BigInt(r)) / total);
    const remainders = ratios.map((r, i) => ({ i, rem: (amount * BigInt(r)) % total }));
    let left = amount - shares.reduce((a, b) => a + b, 0n);
    remainders.sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
    for (const { i } of remainders) {
      if (left === 0n) break;
      shares[i] = (shares[i] ?? 0n) + 1n;
      left -= 1n;
    }
    return shares.map((s) => new Money(checked(Number(negative ? -s : s), "part"), this.currency));
  }
}
