/** Merchant names as SMS give them, made comparable, and the sectors of well-known ones. */

/** The sector ids, mirrored from `@moneytrace/contracts` (the domain imports nothing); a test keeps them equal. */
export const MERCHANT_SECTOR_IDS = [
  "food",
  "transport",
  "groceries",
  "shopping",
  "bills",
  "health",
  "education",
  "family",
  "rent",
  "other",
  "uncategorized",
] as const;
export type MerchantSector = (typeof MERCHANT_SECTOR_IDS)[number];

/** Place and company words banks append to a merchant; dropped from the end of the name. */
const TRAILING_NOISE = new Set(["dhaka", "bd", "bgd", "bangladesh", "ltd", "ltd.", "limited", "pvt", "pvt."]);

const titleWord = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/** "FOODPANDA BD DHAKA" → { name: "Foodpanda", key: "foodpanda" }; null when nothing usable is left. */
export function normalizeMerchant(raw: string): { name: string; key: string } | null {
  const words = raw.trim().split(/\s+/).filter((w) => w !== "");
  while (words.length > 0) {
    const last = (words[words.length - 1] ?? "").toLowerCase();
    if (!TRAILING_NOISE.has(last) && !/^\d+$/.test(last)) break;
    words.pop();
  }
  const key = words.join("").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key === "" || /^\d+$/.test(key)) return null;
  return { name: words.map(titleWord).join(" "), key };
}

/** Fragments of merchant keys and their sectors. A key containing a fragment takes its sector. */
export const KNOWN_MERCHANTS: readonly (readonly [string, MerchantSector])[] = [
  ["foodpanda", "food"],
  ["hungrynaki", "food"],
  ["kfc", "food"],
  ["pizzahut", "food"],
  ["dominos", "food"],
  ["burgerking", "food"],
  ["starbucks", "food"],
  ["northendcoffee", "food"],
  ["takeout", "food"],
  ["sultansdine", "food"],
  ["kacchibhai", "food"],
  ["pathao", "transport"],
  ["uber", "transport"],
  ["obhai", "transport"],
  ["shohoz", "transport"],
  ["usbangla", "transport"],
  ["biman", "transport"],
  ["novoair", "transport"],
  ["railway", "transport"],
  ["shwapno", "groceries"],
  ["meenabazar", "groceries"],
  ["agora", "groceries"],
  ["unimart", "groceries"],
  ["chaldal", "groceries"],
  ["princebazar", "groceries"],
  ["almas", "groceries"],
  ["supershop", "groceries"],
  ["daraz", "shopping"],
  ["aarong", "shopping"],
  ["bata", "shopping"],
  ["apex", "shopping"],
  ["yellow", "shopping"],
  ["lerevenue", "shopping"],
  ["othoba", "shopping"],
  ["rokomari", "shopping"],
  ["bashundharacity", "shopping"],
  ["jamunafuture", "shopping"],
  ["grameenphone", "bills"],
  ["robi", "bills"],
  ["airtel", "bills"],
  ["banglalink", "bills"],
  ["teletalk", "bills"],
  ["desco", "bills"],
  ["dpdc", "bills"],
  ["titas", "bills"],
  ["wasa", "bills"],
  ["netflix", "bills"],
  ["lazzpharma", "health"],
  ["pharma", "health"],
  ["pharmacy", "health"],
  ["squarehospital", "health"],
  ["evercare", "health"],
  ["unitedhospital", "health"],
  ["labaid", "health"],
  ["populardiagnostic", "health"],
  ["ibnsina", "health"],
  ["hospital", "health"],
  ["diagnostic", "health"],
  ["school", "education"],
  ["college", "education"],
  ["university", "education"],
  ["10minuteschool", "education"],
];

/** Longest fragments first, so specific names win over general words. */
const BY_LENGTH = [...KNOWN_MERCHANTS].sort((a, b) => b[0].length - a[0].length);

/** Fragments this short must be a whole word of the name ("robi", not inside "robins"). */
const SHORT = 6;

/**
 * The sector of a well-known merchant, or null: never a guess. Pathao is Food when the SMS says
 * the order was food.
 */
export function knownSector(merchant: { name: string; key: string }, rawText?: string): MerchantSector | null {
  const words = new Set(merchant.name.toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, "")));
  const has = (fragment: string) => (fragment.length < SHORT ? words.has(fragment) : merchant.key.includes(fragment));
  if (has("pathao") && rawText !== undefined && /\bfood\b/i.test(rawText)) return "food";
  for (const [fragment, sector] of BY_LENGTH) if (has(fragment)) return sector;
  return null;
}
