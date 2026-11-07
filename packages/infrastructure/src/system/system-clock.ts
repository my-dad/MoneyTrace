import type { Clock } from "@moneytrace/application";

export class SystemClock implements Clock {
  nowMs(): number {
    return Date.now();
  }
}
