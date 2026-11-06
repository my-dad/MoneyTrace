import type { TransferIntent, PostingStrategy } from "../intents";
import { credit, debit, invalid, requirePositive } from "./shared";

export const transferStrategy: PostingStrategy<TransferIntent> = {
  type: "transfer",
  toEntries(i) {
    requirePositive(i.amount);
    if (i.from.id === i.to.id) throw invalid("transfer needs two different accounts");
    const ok =
      (i.from.kind === "bank" && i.to.kind === "bank") ||
      (i.from.kind === "cash" && i.to.kind === "bank") ||
      (i.from.kind === "cash" && i.to.kind === "cash");
    if (!ok) throw invalid("transfer must be bank to bank, cash to bank or cash to cash");
    return [debit(i.to, i.amount), credit(i.from, i.amount)];
  },
};
