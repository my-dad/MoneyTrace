import { DomainError } from "./errors";

const ISO =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function isCalendarDate(y: number, mo: number, d: number): boolean {
  const probe = new Date(Date.UTC(y, mo - 1, d));
  probe.setUTCFullYear(y);
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

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
    const m = typeof iso === "string" ? ISO.exec(iso) : null;
    const ms =
      m && isCalendarDate(Number(m[1]), Number(m[2]), Number(m[3])) ? Date.parse(iso) : NaN;
    if (Number.isNaN(ms)) {
      throw new DomainError("invalidDate", "not a valid ISO-8601 date-time with Z or an offset");
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
