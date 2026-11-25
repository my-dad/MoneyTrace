import { isManualEntry } from "../../source-event-guards";
import { DEFAULT_MATCH_CONFIG, isWalletProvider, matchCandidate, providerSlug, type MatchResult } from "@moneytrace/domain";
import { isIncoming } from "../candidate-to-intent";
import type { SourceEventRecord } from "../../ports/source-event-repository";
import { CASH_ACCOUNT_ID, ensureSource } from "../sources";
import type { PipelineDeps, Stage } from "./deps";

const CANDIDATE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** The account only if exactly one instrument matches: two sharing an ending must ask. */
async function uniqueAccount(
  deps: PipelineDeps,
  ownerId: Parameters<Stage>[1],
  query: { provider?: string; mask?: string },
): Promise<string | null> {
  const found = await deps.instruments.findForCandidate(ownerId, query);
  const accounts = new Set(found.map((i) => i.linkedAccountId));
  return accounts.size === 1 ? ([...accounts][0] ?? null) : null;
}

export const linkedId = (result: MatchResult): string | null =>
  "transactionId" in result ? result.transactionId : null;

/**
 * Looks for the same transaction already in the ledger. With no date on the evidence, the paste
 * time stands in, so an undated SMS is still compared with what's recent.
 */
export async function findMatch(
  deps: PipelineDeps,
  ownerId: Parameters<Stage>[1],
  candidate: NonNullable<SourceEventRecord["candidate"]>,
  accountId: string,
  receivedAtMs: number,
): Promise<MatchResult> {
  const atMs = candidate.occurredAtMs ?? receivedAtMs;
  const existing = await deps.candidates.findRecent(ownerId, {
    amountMinor: candidate.amountMinor,
    currency: candidate.currency,
    fromMs: atMs - CANDIDATE_LOOKBACK_MS,
    toMs: atMs + CANDIDATE_LOOKBACK_MS,
  });
  return matchCandidate(
    { ...candidate, occurredAtMs: atMs },
    accountId,
    isIncoming(candidate.kind) ? "in" : "out",
    existing,
    DEFAULT_MATCH_CONFIG,
  );
}

/**
 * The source the evidence names (CR-008): a known reference, or a new one remembered now. Two
 * stored sources fitting the same reference still ask; no named source at all asks.
 */
async function sourceOf(
  deps: PipelineDeps,
  ownerId: Parameters<Stage>[1],
  candidate: NonNullable<SourceEventRecord["candidate"]>,
): Promise<string | null> {
  if (candidate.provider === undefined) return null;
  if (candidate.provider === "cash") return CASH_ACCOUNT_ID;
  const query = {
    provider: candidate.provider,
    ...(candidate.instrumentMask === undefined ? {} : { mask: candidate.instrumentMask }),
  };
  const found = new Set((await deps.instruments.findForCandidate(ownerId, query)).map((i) => i.linkedAccountId));
  if (found.size > 1) return null;
  const [only] = [...found];
  if (only !== undefined) return only;
  return ensureSource(deps, ownerId, { provider: candidate.provider, mask: candidate.instrumentMask, kind: candidate.kind });
}

/**
 * Where a transfer went. By the last digits when the SMS has them; otherwise, when it names a
 * wallet ("MFS Transfer-bKash"), that wallet, which is kept without digits like its own SMS
 * (CR-008). Anything else stays unknown, so the user is asked.
 */
async function destinationOf(
  deps: PipelineDeps,
  ownerId: Parameters<Stage>[1],
  candidate: NonNullable<SourceEventRecord["candidate"]>,
): Promise<string | null> {
  if (candidate.destinationMask !== undefined) return uniqueAccount(deps, ownerId, { mask: candidate.destinationMask });
  if (candidate.kind !== "transfer" || candidate.counterparty === undefined) return null;
  const wallet = providerSlug(candidate.counterparty);
  if (wallet === null || !isWalletProvider(wallet) || wallet === candidate.provider) return null;
  return ensureSource(deps, ownerId, { provider: wallet, mask: undefined, kind: candidate.kind });
}

export const matchStage: Stage = async (deps, ownerId, event) => {
  const { candidate } = event;
  if (candidate === null) return { nextStatus: "matched", outputs: [] };
  // Two equal incomes entered by hand are two incomes: never matched as duplicates.
  if (isManualEntry(event)) return { nextStatus: "matched", outputs: [], eventPatch: { matchKind: "none", matchedTransactionId: null } };

  const resolvedAccountId = event.resolvedAccountId ?? (await sourceOf(deps, ownerId, candidate));
  const resolvedDestinationAccountId =
    event.resolvedDestinationAccountId ?? (await destinationOf(deps, ownerId, candidate));

  const result: MatchResult =
    resolvedAccountId === null
      ? { kind: "none" }
      : await findMatch(deps, ownerId, candidate, resolvedAccountId, event.receivedAtMs);
  return {
    nextStatus: "matched",
    outputs: [],
    eventPatch: {
      resolvedAccountId,
      resolvedDestinationAccountId,
      matchKind: result.kind,
      matchedTransactionId: linkedId(result),
    },
  };
};
