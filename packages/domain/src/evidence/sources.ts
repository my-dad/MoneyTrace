import type { CandidateKind } from "./candidate";

/** Where money moves: a bank account, a card, a wallet or cash, as an SMS names it (CR-008). */

const WALLETS = new Set(["bkash", "upay", "nagad"]);
const CARD_KINDS = new Set<CandidateKind>(["cardTransaction", "cardPurchase", "cardRepayment"]);

/** Spellings a bank or DeepSeek may use, folded to the parsers' provider names. */
const ALIASES: [RegExp, string][] = [
  [/^brac/, "brac"],
  [/^mtb$|^mutual-trust/, "mtb"],
  [/^ucb$|^united-commercial/, "ucb"],
  [/^stanchart$|^standard-chartered|^scb$/, "stanchart"],
  [/^trust-?bank|^trustbank/, "trustbank"],
  [/^b-?kash/, "bkash"],
  [/^upay/, "upay"],
  [/^nagad/, "nagad"],
];

const DISPLAY: Record<string, string> = {
  brac: "BRAC",
  mtb: "MTB",
  ucb: "UCB",
  stanchart: "StanChart",
  trustbank: "Trust Bank",
  bkash: "bKash",
  upay: "Upay",
  nagad: "Nagad",
  cash: "Cash",
};

/** A safe provider id from a bank or wallet name, or null when nothing usable is left. */
export function providerSlug(name: string): string | null {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/, "");
  if (slug === "") return null;
  for (const [pattern, provider] of ALIASES) if (pattern.test(slug)) return provider;
  return slug;
}

export const isWalletProvider = (provider: string): boolean => WALLETS.has(provider);

const displayName = (provider: string): string =>
  DISPLAY[provider] ??
  provider
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/** "bKash", "MTB card ••2222", "BRAC ••8888", or just the name when there are no digits. */
export function sourceLabel(provider: string, mask: string | undefined, kind: CandidateKind): string {
  const name = displayName(provider);
  if (isWalletProvider(provider) || mask === undefined || mask === "") return name;
  return CARD_KINDS.has(kind) ? `${name} card ••${mask}` : `${name} ••${mask}`;
}
