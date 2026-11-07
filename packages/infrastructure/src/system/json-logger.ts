import type { LogFields, Logger } from "@moneytrace/application";

const ALLOWED: ReadonlySet<string> = new Set([
  "correlationId",
  "ownerId",
  "stage",
  "status",
  "durationMs",
  "errorCode",
  "sourceEventId",
  "transactionId",
  "providerId",
  "attempt",
]);

/** Same alphabet as document IDs, capped at 128: no spaces, slashes or free text. */
const TOKEN = /^[A-Za-z0-9_:.-]{1,128}$/;

const isToken = (v: unknown): v is string => typeof v === "string" && TOKEN.test(v);

/** Primitives only: a token string, a finite number or a boolean. */
function isLoggable(v: unknown): v is string | number | boolean {
  return isToken(v) || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
}

/** One JSON line per event. Only allowlisted fields are emitted; the rest are counted, not logged. */
export class JsonLogger implements Logger {
  private readonly sink: (line: string) => void;

  constructor(sink: (line: string) => void) {
    this.sink = sink;
  }

  info(event: string, fields: LogFields): void {
    this.emit("info", event, fields);
  }

  warn(event: string, fields: LogFields): void {
    this.emit("warn", event, fields);
  }

  error(event: string, fields: LogFields): void {
    this.emit("error", event, fields);
  }

  /** Never throws: logging must not be able to fail a request, or leak what it refuses to log. */
  private emit(level: string, event: unknown, fields: unknown): void {
    try {
      const kept: Record<string, string | number | boolean> = {};
      let dropped = 0;
      if (typeof fields === "object" && fields !== null) {
        for (const [k, v] of Object.entries(fields)) {
          if (ALLOWED.has(k) && isLoggable(v)) kept[k] = v;
          else dropped += 1;
        }
      }
      this.write({
        level,
        event: isToken(event) ? event : "invalidEvent",
        ...kept,
        ...(dropped > 0 ? { droppedFieldCount: dropped } : {}),
      });
    } catch {
      try {
        this.write({ level, event: "logFailure" });
      } catch {
        // Nothing left to try; the caller must not be affected.
      }
    }
  }

  private write(line: object): void {
    try {
      this.sink(JSON.stringify(line));
    } catch {
      // A failing sink must not fail the caller.
    }
  }
}
