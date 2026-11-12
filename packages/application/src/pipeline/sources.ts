import { asAccountId, isWalletProvider, sourceLabel, type AccountId, type CandidateKind, type OwnerId } from "@moneytrace/domain";
import type { AccountRepository } from "../ports/account-repository";
import type { Clock } from "../ports/clock";
import type { PaymentInstrumentRepository } from "../ports/payment-instrument-repository";

/** The user's own cash, made at sign-up. A cash note read by AI ("cash") lands here (CR-008). */
export const CASH_ACCOUNT_ID = asAccountId("cash-main");

type Deps = { accounts: AccountRepository; instruments: PaymentInstrumentRepository; clock: Clock };

/**
 * The source an SMS names, remembered the first time it appears: an ordinary money account plus
 * the reference (bank or wallet, last digits) later SMS match. Ids are fixed by the reference, so
 * repeats and concurrent first SMS land on the same source.
 */
export async function ensureSource(
  deps: Deps,
  ownerId: OwnerId,
  source: { provider: string; mask: string | undefined; kind: CandidateKind },
): Promise<AccountId> {
  const ending = source.mask ?? "main";
  const accountId = asAccountId(`src-${source.provider}-${ending}`);
  const nowMs = deps.clock.nowMs();
  await deps.accounts.ensure(ownerId, {
    id: accountId,
    kind: "bank",
    name: sourceLabel(source.provider, source.mask, source.kind),
    currency: "BDT",
    status: "active",
    createdAtMs: nowMs,
  });
  const query = { provider: source.provider, ...(source.mask === undefined ? {} : { mask: source.mask }) };
  const linked = async () => (await deps.instruments.findForCandidate(ownerId, query)).some((i) => i.linkedAccountId === accountId);
  if (await linked()) return accountId;
  try {
    await deps.instruments.create(ownerId, {
      id: `inst-${source.provider}-${ending}`,
      // Card type isn't tracked (CR-008); the kind only tells wallets apart for display.
      kind: isWalletProvider(source.provider) ? "mobileWallet" : "bankAccount",
      provider: source.provider,
      maskedIdentifier: source.mask ?? "",
      linkedAccountId: accountId,
      status: "active",
      createdAtMs: nowMs,
    });
  } catch (error) {
    // A concurrent first SMS created it a moment ago.
    if (!(await linked())) throw error;
  }
  return accountId;
}
