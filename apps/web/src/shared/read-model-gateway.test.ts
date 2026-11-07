import { describe, expect, it } from "vitest";
import { InMemoryReadModelGateway } from "./in-memory-read-model-gateway";

describe("in-memory read model gateway", () => {
  it("notifies listeners and unsubscribes cleanly", () => {
    const gateway = new InMemoryReadModelGateway();
    const seen: string[] = [];
    const stop = gateway.watchAccounts((rows) => seen.push(rows[0]?.id ?? "empty"));
    gateway.setAccounts([{ id: "bank", kind: "bank", name: "Bank", currency: "BDT", status: "active", createdAtMs: 1 }]);
    stop();
    gateway.setAccounts([]);
    expect(seen).toEqual(["empty", "bank"]);
  });
});
