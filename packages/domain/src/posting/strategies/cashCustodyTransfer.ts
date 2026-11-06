import type { CashCustodyTransferIntent, PostingStrategy } from "../intents";
import { credit, debit, invalid, requireKind, requireNonBlank, requirePositive } from "./shared";

export const cashCustodyTransferStrategy: PostingStrategy<CashCustodyTransferIntent> = {
  type: "cashCustodyTransfer",
  toEntries(i) {
    requirePositive(i.amount);
    if (i.from.id === i.to.id) throw invalid("custody transfer needs two different accounts");
    requireKind(i.from, "from", "cash", "familyCash");
    requireKind(i.to, "to", "cash", "familyCash");
    if (i.from.kind !== "familyCash" && i.to.kind !== "familyCash") {
      throw invalid("custody transfer must involve family cash");
    }
    requireNonBlank(i.holderName, "holderName");
    return [debit(i.to, i.amount), credit(i.from, i.amount)];
  },
};
