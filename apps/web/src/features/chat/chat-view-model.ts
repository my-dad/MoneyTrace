import type { AccountRow, FollowUpRow, SourceEventRow } from "../../shared/read-model-gateway";
import { COPY } from "../../shared/copy";

export type ChatOutcome = "reading" | "recorded" | "noChange" | "waiting" | "failed";
export type ChatItem =
  | { kind: "evidence"; id: string; text: string; outcome: ChatOutcome; statusCopy: string; event: SourceEventRow }
  | { kind: "followUp"; id: string; question: string; followUp: FollowUpRow; accounts: AccountRow[] };

export function chatOutcome(event: SourceEventRow): ChatOutcome {
  if (event.status === "posted") return "recorded";
  // Nothing went wrong and nothing new was posted: a repeat, a non-financial SMS, or the user's choice.
  if (event.status === "linkedAsDuplicate" || event.status === "rejected" || event.status === "cancelled") return "noChange";
  if (event.status === "pending") return "waiting";
  if (event.status === "deadLetter") return "failed";
  return "reading";
}

export function chatStatusCopy(event: SourceEventRow): string {
  if (event.extraction?.notFinancialReason === "otp") return COPY.otpRefused;
  if (event.extraction?.notFinancialReason !== undefined) return COPY.notFinancial;
  if (event.status === "posted") return COPY.recorded;
  if (event.status === "linkedAsDuplicate") return COPY.linkedAsDuplicate;
  if (event.status === "rejected") return COPY.rejected;
  if (event.status === "cancelled") return COPY.cancelled;
  if (event.status === "pending") {
    if (event.pendingReason === "aiQuotaExhausted") return COPY.aiQuotaExhausted;
    if (event.pendingReason === "providerOutcomeUnknown") return COPY.providerOutcomeUnknown;
    return COPY.awaitingClarification;
  }
  if (event.status === "deadLetter" && event.deadLetterReason === "beforeOpeningBalance") return COPY.beforeOpeningBalance;
  if (event.status === "deadLetter") return COPY.failed;
  return "Reading your evidence";
}

/** A question waiting for the user: open, or snoozed until a time that has passed. The badge and the chat share this. */
export function isAwaitingAnswer(row: FollowUpRow, nowMs: number): boolean {
  return row.state === "open" || (row.state === "snoozed" && row.snoozedUntilMs !== null && row.snoozedUntilMs <= nowMs);
}

export function buildChatTimeline(input: { events: SourceEventRow[]; followUps: FollowUpRow[]; accounts: AccountRow[]; nowMs: number }): ChatItem[] {
  const events: ChatItem[] = input.events.map((event) => ({ kind: "evidence", id: event.id, text: event.retainedText, outcome: chatOutcome(event), statusCopy: chatStatusCopy(event), event }));
  const followUps: ChatItem[] = input.followUps.filter((followUp) => isAwaitingAnswer(followUp, input.nowMs)).map((followUp) => ({ kind: "followUp", id: followUp.id, question: followUp.question, followUp, accounts: input.accounts }));
  return [...events, ...followUps].sort((a, b) => {
    const aAt = a.kind === "evidence" ? a.event.receivedAtMs : a.followUp.createdAtMs;
    const bAt = b.kind === "evidence" ? b.event.receivedAtMs : b.followUp.createdAtMs;
    return aAt - bAt;
  });
}
