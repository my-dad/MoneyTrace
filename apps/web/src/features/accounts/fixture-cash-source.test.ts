import { describe, expect, it } from "vitest";
import { DemoUnavailableError } from "../../shared/demo-unavailable";
import { createFixtureCashSource } from "./fixture-cash-source";

describe("fixture cash source", () => {
  const source = createFixtureCashSource();

  it("lists the debit card linked to DBBL", async () => {
    expect(await source.instruments("bank-dbbl")).toEqual([
      { id: "inst-dbbl-debit", kind: "debitCard", label: "Debit card", masked: "4821" },
    ]);
  });

  it("returns card dues only for cards", async () => {
    expect(await source.cardDue("card-amex")).toEqual({ dueDate: "2026-11-15", statementOwedMinor: 1_845_000 });
    expect(await source.cardDue("bank-dbbl")).toBeNull();
  });

  it("builds history newest first from the household, both sides of a move", async () => {
    const bank = await source.history("bank-dbbl");
    expect(bank.map((item) => item.id)).toEqual(["se-atm", "se-salary"]);
    expect(bank[1]).toMatchObject({ direction: "in", amountMinor: 8_500_000, status: "Verified" });
    const unexplained = await source.history("cash-unassigned");
    expect(unexplained.map((item) => item.id)).toEqual(["se-atm"]);
    expect(unexplained[0]?.direction).toBe("move");
  });

  it("rejects every write as demo-unavailable", async () => {
    await expect(source.recordCashCount({ accountId: "cash-home", countedMinor: 1 })).rejects.toBeInstanceOf(DemoUnavailableError);
    await expect(source.recordAdjustment({ accountId: "cash-home", amountMinor: -1, cause: "spent", note: "" })).rejects.toBeInstanceOf(DemoUnavailableError);
    await expect(source.allocateCash({ fromAccountId: "cash-wallet", toAccountId: "family-ammu", amountMinor: 1 })).rejects.toBeInstanceOf(DemoUnavailableError);
  });
});
