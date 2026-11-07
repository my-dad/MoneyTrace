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

  private emit(level: string, event: string, fields: LogFields): void {
    const kept: Record<string, string | number | boolean> = {};
    let dropped = 0;
    for (const [k, v] of Object.entries(fields)) {
      if (ALLOWED.has(k)) kept[k] = v;
      else dropped += 1;
    }
    this.sink(
      JSON.stringify({
        level,
        event,
        ...kept,
        ...(dropped > 0 ? { droppedFieldCount: dropped } : {}),
      }),
    );
  }
}
