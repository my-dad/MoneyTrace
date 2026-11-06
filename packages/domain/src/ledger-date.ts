import { DomainError } from "./errors";

export class LedgerDate {
  readonly epochMs: number;

  private constructor(epochMs: number) {
    this.epochMs = epochMs;
    Object.freeze(this);
  }

  static fromEpochMs(ms: number): LedgerDate {
    if (
      typeof ms !== "number" ||
      !Number.isSafeInteger(ms) ||
      Number.isNaN(new Date(ms).getTime())
    ) {
      throw new DomainError("invalidDate", "epoch ms must be a valid integer timestamp");
    }
    return new LedgerDate(ms);
  }

  static fromIso(iso: string): LedgerDate {
    const ms = typeof iso === "string" ? Date.parse(iso) : NaN;
    if (Number.isNaN(ms)) {
      throw new DomainError("invalidDate", "not a valid ISO date");
    }
    return new LedgerDate(ms);
  }

  toIso(): string {
    return new Date(this.epochMs).toISOString();
  }

  isAfter(o: LedgerDate): boolean {
    return this.epochMs > o.epochMs;
  }
}
