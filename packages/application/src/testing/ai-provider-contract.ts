import { beforeEach, describe, expect, it } from "vitest";
import type { AIProvider } from "../ports/ai-provider";
import { liveSignal } from "./fake-provider";

const context = { allowedCategories: ["groceries"], nowMs: 1_700_000_000_000, clarifications: [] };

/** `make` returns a provider that will answer this text with a usable transaction. */
export function describeAiProviderContract(name: string, make: () => AIProvider): void {
  describe(`${name} AI provider contract`, () => {
    let provider: AIProvider;
    beforeEach(() => {
      provider = make();
    });

    it("identifies itself for the audit trail", () => {
      expect(provider.id.length).toBeGreaterThan(0);
      expect(provider.model.length).toBeGreaterThan(0);
      expect(provider.promptVersion.length).toBeGreaterThan(0);
    });

    it("declares no idempotency it does not have", () => {
      expect(["none", "localPure", "idempotentKey"]).toContain(provider.retrySafety);
    });

    it("returns a candidate with exact amounts", async () => {
      const outcome = await provider.interpretEvidence(
        { text: "paid 500 for rickshaw", context },
        "key-1",
        liveSignal(),
      );
      expect(outcome).toMatchObject({
        kind: "success",
        value: { kind: "transaction", candidate: { amountMinor: 50000, currency: "BDT" } },
      });
    });

    it("writes advice for the facts it is sent", async () => {
      const outcome = await provider.writeTips(
        { facts: [{ id: "unsorted", kind: "unsorted", headline: "৳2,500 isn't sorted yet", detail: "Sorting it shows where it went" }], dayOfMonth: 6, daysInMonth: 30 },
        "tips-key-1",
        liveSignal(),
      );
      expect(outcome.kind).toBe("success");
      expect(outcome.kind === "success" && Array.isArray(outcome.value.tips)).toBe(true);
      expect(provider.tipsPromptVersion.length).toBeGreaterThan(0);
    });
  });
}
