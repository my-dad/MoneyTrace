import type { LogFields } from "@moneytrace/application";
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

  const RAW = "Tk 5000 a/c 1234";
  const run = (
    event: unknown,
    fields: unknown,
  ): { line: string; parsed: Record<string, unknown> } => {
    const lines: string[] = [];
    new JsonLogger((l) => lines.push(l)).info(event as string, fields as LogFields);
    const line = lines[0] ?? "";
    return { line, parsed: JSON.parse(line) as Record<string, unknown> };
  };

  it("replaces an event name that is free text", () => {
    const { line, parsed } = run(`sms parse failed: ${RAW}`, {});
    expect(parsed["event"]).toBe("invalidEvent");
    expect(line).not.toContain("5000");
    expect(line).not.toContain("1234");
  });

  it("drops a long string in an allowlisted field", () => {
    const { line, parsed } = run("x", { errorCode: `${RAW} `.repeat(200) });
    expect(parsed["errorCode"]).toBeUndefined();
    expect(parsed["droppedFieldCount"]).toBe(1);
    expect(line).not.toContain("5000");
  });

  it("drops an object value in an allowlisted field", () => {
    const { line, parsed } = run("x", { status: { raw: RAW } });
    expect(parsed["status"]).toBeUndefined();
    expect(parsed["droppedFieldCount"]).toBe(1);
    expect(line).not.toContain("5000");
  });

  it("drops an array value in an allowlisted field", () => {
    const { line, parsed } = run("x", { correlationId: [RAW] });
    expect(parsed["correlationId"]).toBeUndefined();
    expect(parsed["droppedFieldCount"]).toBe(1);
    expect(line).not.toContain("1234");
  });

  it("drops a string with spaces or slashes, and a non-finite number", () => {
    const { line, parsed } = run("x", { stage: RAW, durationMs: Number.NaN, attempt: 2 });
    expect(parsed["stage"]).toBeUndefined();
    expect(parsed["durationMs"]).toBeUndefined();
    expect(parsed["attempt"]).toBe(2);
    expect(parsed["droppedFieldCount"]).toBe(2);
    expect(line).not.toContain("5000");
  });

  it("does not throw on a BigInt, a null field bag, or a throwing sink", () => {
    expect(run("x", { attempt: 10n }).parsed["droppedFieldCount"]).toBe(1);
    expect(run("x", null).parsed["event"]).toBe("x");
    const throwing = new JsonLogger(() => {
      throw new Error("sink down");
    });
    expect(() => {
      throwing.error("x", { attempt: 1 });
    }).not.toThrow();
  });
});
