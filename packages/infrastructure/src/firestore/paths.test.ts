import { describe, expect, it } from "vitest";
import { ownerPath } from "./paths";

describe("ownerPath", () => {
  it("builds owner-scoped collection and document paths", () => {
    expect(ownerPath("alice", "transactions")).toBe("users/alice/transactions");
    expect(ownerPath("alice", "idempotencyRecords", "ledger:k1")).toBe(
      "users/alice/idempotencyRecords/ledger:k1",
    );
  });

  it("refuses segments that could address another path", () => {
    expect(() => ownerPath("al/ice", "accounts")).toThrow();
    expect(() => ownerPath("alice", "accounts", "a/b")).toThrow();
    expect(() => ownerPath("alice", "accounts", "..")).toThrow();
    expect(() => ownerPath("", "accounts")).toThrow();
  });
});
