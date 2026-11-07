import { describe, expect, it } from "vitest";
import { systemTimeoutSignal } from "./abort-timeout";

describe("systemTimeoutSignal", () => {
  it("aborts after the given time and not before", async () => {
    const signal = systemTimeoutSignal(5);
    expect(signal.aborted).toBe(false);
    await new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => {
        resolve();
      });
    });
    expect(signal.aborted).toBe(true);
  });
});
