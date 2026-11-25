import { Money, asTransactionId, type AccountRef, type OwnerId, type PostingIntent } from "@moneytrace/domain";
import { SYSTEM_CASH_ACCOUNT_ID } from "../use-cases/bootstrap-user";
import type { PipelineDeps } from "./stages/deps";

/** The cash an outgoing cash intent spends, or null when it doesn't spend cash. */
function cashSpent(intent: PostingIntent): { from: AccountRef; amount: Money } | null {
  const spent =
    intent.type === "purchase"
      ? { from: intent.funding, amount: intent.amount }
      : intent.type === "fee"
        ? { from: intent.charged, amount: intent.amount }
        : null;
  return spent !== null && spent.from.kind === "cash" && spent.from.id !== SYSTEM_CASH_ACCOUNT_ID ? spent : null;
}

/**
 * Cash spent comes out of withdrawn cash first: a move from the pocket (`cash-unassigned`) into
 * the cash it is spent from, of at most what the pocket holds. Never spending, never income.
 * Null when nothing should move, including on a replay whose move already posted.
 */
export async function pocketDraw(
  deps: PipelineDeps,
  ownerId: OwnerId,
  intent: PostingIntent,
  transactionId: string,
): Promise<PostingIntent | null> {
  const spent = cashSpent(intent);
  if (spent === null) return null;
  const { from: to, amount } = spent;
  if ((await deps.ledger.getTransaction(ownerId, asTransactionId(`${transactionId}-pocket`))) !== null) return null;
  const pocket = await deps.ledger.getBalance(ownerId, SYSTEM_CASH_ACCOUNT_ID);
  const minor = Math.min(pocket, amount.minor);
  if (minor <= 0) return null;
  return {
    type: "transfer",
    from: { id: SYSTEM_CASH_ACCOUNT_ID, kind: "cash", currency: to.currency },
    to,
    amount: Money.ofMinor(minor, amount.currency),
  };
}
