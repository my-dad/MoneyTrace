import type { PostingIntent, PostingStrategy } from "../intents";
import { adjustmentStrategy } from "./adjustment";
import { cardPurchaseStrategy } from "./cardPurchase";
import { cardRepaymentStrategy } from "./cardRepayment";
import { cashCustodyTransferStrategy } from "./cashCustodyTransfer";
import { feeStrategy } from "./fee";
import { historicalImportStrategy } from "./historicalImport";
import { incomeStrategy } from "./income";
import { openingBalanceStrategy } from "./openingBalance";
import { purchaseStrategy } from "./purchase";
import { refundStrategy } from "./refund";
import { transferStrategy } from "./transfer";
import { withdrawalStrategy } from "./withdrawal";

export const defaultStrategies: readonly PostingStrategy<PostingIntent>[] = [
  withdrawalStrategy,
  transferStrategy,
  purchaseStrategy,
  cardPurchaseStrategy,
  cardRepaymentStrategy,
  incomeStrategy,
  feeStrategy,
  refundStrategy,
  adjustmentStrategy,
  openingBalanceStrategy,
  cashCustodyTransferStrategy,
  historicalImportStrategy,
];
