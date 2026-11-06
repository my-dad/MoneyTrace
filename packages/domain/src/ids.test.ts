import { describe, expect, it } from "vitest";
import { asAccountId, asIdempotencyKey, asOwnerId, asSourceEventId, asTransactionId } from "./ids";

const code = (c: string): unknown => expect.objectContaining({ code: c });

describe.each([
  ["asOwnerId", asOwnerId],
  ["asAccountId", asAccountId],
  ["asTransactionId", asTransactionId],
  ["asSourceEventId", asSourceEventId],
  ["asIdempotencyKey", asIdempotencyKey],
])("%s", (_name, make) => {
  it("accepts valid ids", () => {
    expect(make("abc_DEF:1.2-3")).toBe("abc_DEF:1.2-3");
    expect(make("a".repeat(128))).toBe("a".repeat(128));
  });

  it.each(["", "a/b", "a".repeat(129), "has space", "new\nline"])("rejects %j", (bad) => {
    expect(() => make(bad)).toThrow(code("invalidId"));
  });

  it("rejects non-strings", () => {
    expect(() => make(5 as unknown as string)).toThrow(code("invalidId"));
  });
});
