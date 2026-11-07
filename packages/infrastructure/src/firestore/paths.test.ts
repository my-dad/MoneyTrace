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
    const invalid = expect.objectContaining({ code: "invalidId" }) as Error;
    expect(() => ownerPath("al/ice", "accounts")).toThrow(invalid);
    expect(() => ownerPath("alice", "accounts", "a/b")).toThrow(invalid);
    expect(() => ownerPath("alice", "accounts", ".")).toThrow(invalid);
    expect(() => ownerPath("alice", "accounts", "..")).toThrow(invalid);
    expect(() => ownerPath("", "accounts")).toThrow(invalid);
    expect(() => ownerPath("alice", "accounts", "__x__")).toThrow(invalid);
    expect(() => ownerPath("__x__", "accounts")).toThrow(invalid);
  });
});
