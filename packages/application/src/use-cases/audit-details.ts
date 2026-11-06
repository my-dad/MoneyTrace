import type { PostingIntent } from "@moneytrace/domain";
import type { TransactionRecord } from "../ports/ledger-reader";

/** Cause and authorizer of an adjustment, and the holder of a custody transfer (PRD section 7). */
export function auditDetailsOf(intent: PostingIntent): TransactionRecord["auditDetails"] {
  switch (intent.type) {
    case "adjustment":
      return { cause: intent.cause, authorizedBy: intent.authorizedBy };
    case "cashCustodyTransfer":
      return { holderName: intent.holderName };
    case "historicalImport":
      return auditDetailsOf(intent.inner);
    default:
      return undefined;
  }
}
