import { formatBdt, nextLocalTimeMs } from "@moneytrace/contracts";
import {
  DomainError,
  Money,
  asIdempotencyKey,
  asTransactionId,
  type CurrencyCode,
  type PostingIntent,
} from "@moneytrace/domain";
import type { StageCommit, StageOutput } from "../../ports/source-event-repository";
import { stageOutputId } from "../../source-event-guards";
import { candidateToIntent, isIncoming } from "../candidate-to-intent";
import { resolveAccounts } from "./decide";
import { accountRef, type PipelineDeps, type Stage } from "./deps";

const DEFAULT_TIMEZONE = "Asia/Dhaka";
const DEFAULT_DIGEST_LOCAL_TIME = "20:00";

/** Never says the cash was spent, lost or missing (PRD section 11). */
const withdrawalQuestion = (amountMinor: number): string =>
  `You withdrew ${formatBdt(amountMinor)} from an ATM. Where did the cash go?`;

async function followUpOutput(
  deps: PipelineDeps,
  ownerId: Parameters<Stage>[1],
  eventId: string,
  transactionId: string,
  amountMinor: number,
): Promise<StageOutput> {
  const id = stageOutputId(eventId, "post", "followUp");
  const profile = await deps.profiles.get(ownerId);
  const nowMs = deps.clock.nowMs();
  return {
    collection: "followUps",
    docId: id,
    data: {
      id,
      trigger: "withdrawalDestination",
      targetTransactionId: transactionId,
      question: withdrawalQuestion(amountMinor),
      dueAtMs: nextLocalTimeMs(
        nowMs,
        profile?.timezone ?? DEFAULT_TIMEZONE,
        profile?.notifications.digestLocalTime ?? DEFAULT_DIGEST_LOCAL_TIME,
      ),
      snoozedUntilMs: null,
      state: "open",
      createdAtMs: nowMs,
      resolvedAtMs: null,
    },
  };
}

const deadLetter = (reason: "beforeOpeningBalance" | "stageFailed"): StageCommit => ({
  nextStatus: "deadLetter",
  deadLetterReason: reason,
  outputs: [],
});

const REAL_KINDS: ReadonlySet<string> = new Set(["bank", "cash", "familyCash", "creditLiability"]);

/**
 * The other half of the user's own transfer was already recorded as spending or income: correct it
 * into the transfer (reverse and replace, audited) instead of posting this half (CR-008). The key
 * is fixed by this event, so a replay never corrects twice.
 */
async function pairAsTransfer(
  deps: Parameters<Stage>[0],
  ownerId: Parameters<Stage>[1],
  event: Parameters<Stage>[2],
  counterpartId: string,
): Promise<StageCommit> {
  const ask: StageCommit = {
    nextStatus: "pending",
    pendingReason: "awaitingClarification",
    outputs: [],
    eventPatch: { matchKind: "none", matchedTransactionId: null },
  };
  const { candidate } = event;
  if (candidate === null || event.resolvedAccountId === null) return ask;
  const entries = await deps.ledger.getEntries(ownerId, asTransactionId(counterpartId));
  const other = entries.find((e) => REAL_KINDS.has(e.accountKind) && e.accountId !== event.resolvedAccountId);
  const [here, there] = await Promise.all([
    accountRef(deps, ownerId, event.resolvedAccountId),
    accountRef(deps, ownerId, other?.accountId ?? null),
  ]);
  if (here === null || there === null) return ask;
  const incoming = isIncoming(candidate.kind);
  try {
    const result = await deps.correct.execute({
      ownerId,
      idempotencyKey: asIdempotencyKey(`transfer-${event.id}`),
      originalTransactionId: asTransactionId(counterpartId),
      replacement: {
        type: "transfer",
        from: incoming ? there : here,
        to: incoming ? here : there,
        amount: Money.ofMinor(candidate.amountMinor, candidate.currency as CurrencyCode),
      },
      actor: "pipeline",
      rationale: "Paired as your own transfer",
    });
    if (result.status === "idempotencyConflict") return ask;
  } catch (error) {
    // Already paired with something else, or no longer live: let the user decide.
    if (error instanceof DomainError) return ask;
    throw error;
  }
  // The fee this half's SMS reports is still a real charge on its own source.
  if (candidate.feeMinor !== undefined && candidate.feeMinor > 0) {
    const fee = await deps.post.execute({
      ownerId,
      occurredAtMs: candidate.occurredAtMs ?? event.receivedAtMs,
      sourceEventIds: [event.id],
      actor: event.userConfirmed ? ownerId : "pipeline",
      idempotencyKey: asIdempotencyKey(`${event.id}-fee`),
      transactionId: asTransactionId(`txn-${event.id}-fee`),
      intent: { type: "fee", charged: here, amount: Money.ofMinor(candidate.feeMinor, candidate.currency as CurrencyCode) },
    });
    if (fee.status === "idempotencyConflict") return deadLetter("stageFailed");
  }
  return {
    nextStatus: "posted",
    outputs: [],
    eventPatch: { resolvedDestinationAccountId: there.id, matchedTransactionId: `${counterpartId}:repl` },
  };
}

/** Both postings are idempotent by their keys, so a crash between them retries safely. */
export const postStage: Stage = async (deps, ownerId, event) => {
  const { candidate } = event;
  if (event.matchKind === "transferCounterpart" && event.matchedTransactionId !== null) {
    return pairAsTransfer(deps, ownerId, event, event.matchedTransactionId.replace(/:repl$/, ""));
  }
  if (candidate?.occurredAtMs === null || candidate === null) return deadLetter("stageFailed");
  const occurredAtMs = candidate.occurredAtMs;
  const resolved = await resolveAccounts(deps, ownerId, event);
  const intent = candidateToIntent(candidate, resolved);
  if (intent === null || resolved.source === null) return deadLetter("stageFailed");

  const transactionId =
    event.matchKind === "finalizesAuthorization" && event.matchedTransactionId !== null
      ? event.matchedTransactionId
      : `txn-${event.id}`;
  const common = {
    ownerId,
    occurredAtMs,
    sourceEventIds: [event.id],
    actor: event.userConfirmed ? ownerId : "pipeline",
    ...(candidate.reference === undefined ? {} : { reference: candidate.reference }),
  };
  const post = (id: string, key: string, posting: PostingIntent) =>
    deps.post.execute({
      ...common,
      idempotencyKey: asIdempotencyKey(key),
      transactionId: asTransactionId(id),
      intent: posting,
    });
  try {
    const main = await post(transactionId, event.id, intent);
    if (main.status === "idempotencyConflict") return deadLetter("stageFailed");
    if (candidate.feeMinor !== undefined) {
      const fee = await post(`${transactionId}-fee`, `${event.id}-fee`, {
        type: "fee",
        charged: resolved.source,
        amount: Money.ofMinor(candidate.feeMinor, candidate.currency as CurrencyCode),
      });
      if (fee.status === "idempotencyConflict") return deadLetter("stageFailed");
    }
  } catch (error) {
    if (error instanceof DomainError) {
      return deadLetter(error.code === "beforeCutover" ? "beforeOpeningBalance" : "stageFailed");
    }
    throw error;
  }
  const asksWhere = intent.type === "withdrawal" && event.resolvedDestinationAccountId === null;
  return {
    nextStatus: "posted",
    outputs: asksWhere
      ? [await followUpOutput(deps, ownerId, event.id, transactionId, candidate.amountMinor)]
      : [],
  };
};
