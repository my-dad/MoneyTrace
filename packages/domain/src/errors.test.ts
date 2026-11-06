import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";

describe("DomainError", () => {
  it("carries a code and message and is an Error", () => {
    const e = new DomainError("invalidMoney", "bad");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("invalidMoney");
    expect(e.message).toBe("bad");
    expect(e.name).toBe("DomainError");
  });
});
