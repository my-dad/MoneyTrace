import { describe, expect, it } from "vitest";
import { JsonLogger } from "./json-logger";

describe("JsonLogger", () => {
  it("emits allowlisted fields as one JSON line", () => {
    const lines: string[] = [];
    new JsonLogger((l) => lines.push(l)).info("stage.done", {
      correlationId: "c-1",
      ownerId: "alice",
      stage: "post",
      status: "ok",
      durationMs: 12,
      errorCode: "none",
      sourceEventId: "se-1",
      transactionId: "tx-1",
      providerId: "deepseek",
      attempt: 2,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("\n");
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      level: "info",
      event: "stage.done",
      correlationId: "c-1",
      ownerId: "alice",
      stage: "post",
      status: "ok",
      durationMs: 12,
      errorCode: "none",
      sourceEventId: "se-1",
      transactionId: "tx-1",
      providerId: "deepseek",
      attempt: 2,
    });
  });

  it("drops fields outside the allowlist and counts them", () => {
    const lines: string[] = [];
    new JsonLogger((l) => lines.push(l)).warn("parse.failed", {
      correlationId: "c-1",
      rawText: "Tk 5000 a/c 1234",
    });
    const line = lines[0] ?? "";
    expect(line).not.toContain("rawText");
    expect(line).not.toContain("5000");
    expect(JSON.parse(line)).toEqual({
      level: "warn",
      event: "parse.failed",
      correlationId: "c-1",
      droppedFieldCount: 1,
    });
  });
});
