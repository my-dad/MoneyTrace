import { TIP_ADVICE_MAX, type TipFact, type TipsReply } from "@moneytrace/contracts";

/** The figures are ours: advice that states any amount is dropped, in digits or in words. */
const STATES_AN_AMOUNT = /[0-9০-৯৳]|\b(hundred|thousand|lakhs?|lacs?|crores?|percent|taka|tk)\b/i;
/** Unexplained cash is not necessarily spent (the reminder wording rule). */
const SAYS_CASH_WAS_SPENT = /\b(spent|spend|spending|wasted|lost)\b/i;
const MAX_SENTENCES = 2;

const sentences = (text: string): number => text.split(/[.!?]+(?:\s+|$)/).filter((part) => part.trim() !== "").length;

function acceptable(advice: string, fact: TipFact): boolean {
  if (advice === "" || advice.length > TIP_ADVICE_MAX) return false;
  if (sentences(advice) > MAX_SENTENCES) return false;
  if (STATES_AN_AMOUNT.test(advice)) return false;
  if (fact.kind === "unexplainedCash" && SAYS_CASH_WAS_SPENT.test(advice)) return false;
  return true;
}

/**
 * The advice we keep, by fact id. Deterministic: the prompt asks for these rules, this enforces
 * them. A fact whose advice fails still shows, with its headline and detail only.
 */
export function validateAdvice(reply: TipsReply, sent: readonly TipFact[]): Record<string, string> {
  const facts = new Map(sent.map((f) => [f.id, f]));
  const kept: Record<string, string> = {};
  const seen = new Set<string>();
  for (const tip of reply.tips) {
    const fact = facts.get(tip.factId);
    if (fact === undefined || seen.has(tip.factId)) continue;
    seen.add(tip.factId);
    const advice = tip.advice.trim();
    if (acceptable(advice, fact)) kept[tip.factId] = advice;
  }
  return kept;
}
