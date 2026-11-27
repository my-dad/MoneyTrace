import { dhakaDay, type SectorId, type TipKind } from "@moneytrace/contracts";
import { TIPS_COPY } from "../../shared/copy";
import type { TipsRow } from "../../shared/read-model-gateway";

export type TipItem = { id: string; kind: TipKind; sector?: SectorId; headline: string; detail: string; advice?: string };

export type TipsViewModel =
  | { kind: "none" }
  | { kind: "notEnoughData"; waitingFor: "twoWeeks" | "moreSpends" }
  | { kind: "tips"; items: TipItem[]; age: string | null; factsOnly: boolean };

const DAY_MS = 86_400_000;
const dayNumber = (ms: number): number => Date.parse(`${dhakaDay(ms)}T00:00:00Z`) / DAY_MS;

/** What the tips card shows. A document from an earlier month is stale: nothing until it is refreshed. */
export function tipsView(doc: TipsRow | null, nowMs: number): TipsViewModel {
  if (doc === null || doc.month !== dhakaDay(nowMs).slice(0, 7)) return { kind: "none" };
  if (doc.status === "notEnoughData") return { kind: "notEnoughData", waitingFor: doc.waitingFor ?? "twoWeeks" };
  return {
    kind: "tips",
    items: doc.facts.map((f) => {
      const advice = doc.advice[f.id];
      return {
        id: f.id,
        kind: f.kind,
        ...(f.sector === undefined ? {} : { sector: f.sector }),
        headline: f.headline,
        detail: f.detail,
        ...(advice === undefined ? {} : { advice }),
      };
    }),
    age: doc.adviceAtMs === null ? null : TIPS_COPY.madeAgo(dayNumber(nowMs) - dayNumber(doc.adviceAtMs)),
    factsOnly: doc.status === "factsOnly",
  };
}
