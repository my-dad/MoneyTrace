import { assertAfterCutover } from "../../ledger/cutover";
import type { HistoricalImportIntent, PostingStrategy } from "../intents";
import { invalid } from "./shared";

export const historicalImportStrategy: PostingStrategy<HistoricalImportIntent> = {
  type: "historicalImport",
  toEntries(i, ctx) {
    if (i.inner.type === "openingBalance" || i.inner.type === "historicalImport") {
      throw invalid(`historicalImport cannot wrap ${i.inner.type}`);
    }
    const entries = ctx.delegate(i.inner);
    assertAfterCutover(entries, i.occurredAt, i.cutovers);
    return entries;
  },
};
