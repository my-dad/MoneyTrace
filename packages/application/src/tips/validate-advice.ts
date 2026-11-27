import { TIP_ADVICE_MAX, type TipFact, type TipsReply } from "@moneytrace/contracts";

/**
 * The figures are ours: advice that states any amount is dropped, in digits or in words. Small
 * counts (one to ten: "two fewer takeaways") are advice, not amounts, so they stay.
 */
const STATES_AN_AMOUNT =
  /[0-9%৳]|\b(eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|lakhs?|lacs?|crores?|dozens?|millions?|percent|per\s+cent|taka|tk|bdt)\b/i;
/** Advice is English; Bangla script (digits or words) could state an amount we can't check. */
const BANGLA_SCRIPT = /[\u0980-\u09FF]/;
/** Unexplained cash is not necessarily spent (the reminder wording rule): no verb that says it went. */
const SAYS_IT_WENT = /\b(spent|spend|spending|wasted|lost|went|gone|used|paid|pay|splurged?|blew)\b/i;
/** Advice on another fact that talks about that cash at all is held to the same rule. */
const MENTIONS_THAT_CASH = /\b(unexplained|unaccounted|loose cash|missing cash|that cash|this cash|the cash|withdrawn cash)\b/i;
const MAX_SENTENCES = 2;

/** Common abbreviations end in a full stop but don't end a sentence. */
const ABBREVIATION = /\b(e\.g|i\.e|etc|vs|mr|mrs|ms|dr|st)\./gi;

const sentences = (text: string): number =>
  text.replace(ABBREVIATION, "$1").split(/[.!?]+(?:\s+|$)/).filter((part) => part.trim() !== "").length;

function acceptable(advice: string, fact: TipFact): boolean {
  if (advice === "" || advice.length > TIP_ADVICE_MAX) return false;
  if (sentences(advice) > MAX_SENTENCES) return false;
  if (STATES_AN_AMOUNT.test(advice) || BANGLA_SCRIPT.test(advice)) return false;
  const aboutThatCash = fact.kind === "unexplainedCash" || MENTIONS_THAT_CASH.test(advice);
  if (aboutThatCash && SAYS_IT_WENT.test(advice)) return false;
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
