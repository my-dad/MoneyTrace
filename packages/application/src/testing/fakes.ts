import type { Clock } from "../ports/clock";
import type { Hasher } from "../ports/hasher";
import type { IdGenerator } from "../ports/id-generator";
import type { LogFields, Logger } from "../ports/logger";

export class FakeClock implements Clock {
  private ms: number;

  constructor(startMs = 1_700_000_000_000) {
    this.ms = startMs;
  }

  nowMs(): number {
    return this.ms;
  }

  advance(deltaMs: number): void {
    this.ms += deltaMs;
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private n = 0;

  newId(): string {
    this.n += 1;
    return `id-${String(this.n)}`;
  }
}

/** Deterministic and collision-resistant enough for tests (64-bit FNV-1a); not a real SHA-256. */
export class TestHasher implements Hasher {
  sha256(text: string): string {
    let h = 0xcbf29ce484222325n;
    for (let i = 0; i < text.length; i++) {
      h ^= BigInt(text.charCodeAt(i));
      h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    return `test-${h.toString(16).padStart(16, "0")}`;
  }
}

export type LoggedEvent = { level: "info" | "warn" | "error"; event: string; fields: LogFields };

export class CapturingLogger implements Logger {
  readonly events: LoggedEvent[] = [];

  info(event: string, fields: LogFields): void {
    this.events.push({ level: "info", event, fields });
  }

  warn(event: string, fields: LogFields): void {
    this.events.push({ level: "warn", event, fields });
  }

  error(event: string, fields: LogFields): void {
    this.events.push({ level: "error", event, fields });
  }
}
