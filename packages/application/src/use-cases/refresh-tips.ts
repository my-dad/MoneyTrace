import { dhakaDay, FORCED_TIPS_PER_DAY, monthRange, SECTOR_LABELS, SYSTEM_CASH_ACCOUNT_ID, type TipFact } from "@moneytrace/contracts";
import { asAccountId, type OwnerId } from "@moneytrace/domain";
import type { AIGateway } from "../pipeline/ai-gateway";
import type { TipsInput } from "../ports/ai-provider";
import type { Clock } from "../ports/clock";
import type { Hasher } from "../ports/hasher";
import type { LedgerReader } from "../ports/ledger-reader";
import type { Logger } from "../ports/logger";
import type { TipsDoc, TipsFields, TipsRepository } from "../ports/tips-repository";
import { tipFacts } from "../tips/tip-facts";
import { validateAdvice } from "../tips/validate-advice";

export type TipsWriter = Pick<AIGateway, "writeTips" | "tipsIdentity">;

export type RefreshTipsOutcome = "made" | "unchanged" | "factsOnly" | "notEnoughData" | "limitReached";

type Deps = { reader: LedgerReader; tips: TipsRepository; writer: TipsWriter; hasher: Hasher; clock: Clock; logger: Logger };

/**
 * Saves this month's tip figures every time (so they always match the tiles) and asks DeepSeek
 * for advice only when it is due: once a Dhaka day when the figures changed, or on "New tips"
 * (at most three a day). Advice never holds a number, so it stays while its fact is chosen.
 */
export class RefreshTips {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: { ownerId: OwnerId; force: boolean }): Promise<{ outcome: RefreshTipsOutcome }> {
    const outcome = await this.refresh(input.ownerId, input.force);
    return { outcome };
  }

  private async refresh(ownerId: OwnerId, force: boolean): Promise<RefreshTipsOutcome> {
    const { reader, tips, clock } = this.deps;
    const nowMs = clock.nowMs();
    const today = dhakaDay(nowMs);
    const month = monthRange(nowMs, 0);
    const entries = await reader.listEntriesInRange(ownerId, monthRange(nowMs, -1).fromMs, nowMs);
    const result = tipFacts({
      nowMs,
      expenses: entries.filter((e) => e.accountKind === "expense"),
      income: entries.filter((e) => e.accountKind === "income" && e.occurredAtMs >= month.fromMs),
      unexplainedCashMinor: Math.max(0, await reader.getBalance(ownerId, asAccountId(SYSTEM_CASH_ACCOUNT_ID))),
    });
    const previous = await tips.get(ownerId);
    const base: Omit<TipsFields, "status" | "facts" | "advice" | "factsHash"> = {
      month: today.slice(0, 7),
      generatedAtMs: nowMs,
      aiDay: previous?.aiDay ?? null,
      aiFactsHash: previous?.aiFactsHash ?? null,
      adviceAtMs: previous?.adviceAtMs ?? null,
      ...identityOf(previous),
    };

    if (result.status === "notEnoughData") {
      await tips.save(ownerId, { ...base, status: "notEnoughData", waitingFor: result.waitingFor, facts: [], advice: {}, factsHash: null });
      return this.done("notEnoughData", 0);
    }

    const { facts } = result;
    const factsHash = this.deps.hasher.sha256(JSON.stringify(facts.map((f) => [f.id, f.amountMinor, f.compareMinor ?? null])));
    const kept = Object.fromEntries(facts.flatMap((f) => (previous?.advice[f.id] === undefined ? [] : [[f.id, previous.advice[f.id]]]))) as Record<string, string>;
    const keptStatus = previous?.status === "ready" && Object.keys(kept).length > 0 ? "ready" : "factsOnly";
    const saved: TipsFields = { ...base, status: facts.length === 0 ? "ready" : keptStatus, facts, advice: kept, factsHash };
    await tips.save(ownerId, saved);
    if (facts.length === 0) return this.done("unchanged", 0);

    let requestKey = `tips-${today}-auto`;
    if (force) {
      const n = await tips.claimForced(ownerId, today, FORCED_TIPS_PER_DAY);
      if (n === null) return this.done("limitReached", facts.length);
      requestKey = `tips-${today}-new-${String(n)}`;
    } else if (saved.aiDay === today || saved.aiFactsHash === factsHash) {
      return this.done("unchanged", facts.length);
    }

    let call: Awaited<ReturnType<TipsWriter["writeTips"]>>;
    try {
      call = await this.deps.writer.writeTips(ownerId, requestKey, tipsInput(facts, nowMs));
    } catch (error) {
      // No AI (no key, a store error around the call): the saved figures stand; a later open retries.
      this.deps.logger.error("tips.adviceFailed", { errorName: error instanceof Error ? error.name : "unknown" });
      await tips.save(ownerId, { ...saved, status: "factsOnly" });
      return this.done("factsOnly", facts.length);
    }
    const afterCall: TipsFields = call.kind === "quotaExhausted" ? saved : { ...saved, aiDay: today, aiFactsHash: factsHash };
    const advice = call.kind === "result" ? validateAdvice(call.value, facts) : {};
    if (Object.keys(advice).length === 0) {
      await tips.save(ownerId, { ...afterCall, status: "factsOnly" });
      return this.done("factsOnly", facts.length);
    }
    const { model, promptVersion } = this.deps.writer.tipsIdentity;
    await tips.save(ownerId, { ...afterCall, status: "ready", advice, adviceAtMs: nowMs, model, promptVersion });
    return this.done("made", facts.length);
  }

  /** The outcome only: tip text and amounts never reach the logs. */
  private done(outcome: RefreshTipsOutcome, factCount: number): RefreshTipsOutcome {
    this.deps.logger.info("tips.refreshed", { outcome, factCount });
    return outcome;
  }
}

function identityOf(doc: TipsDoc | null): { model?: string; promptVersion?: string } {
  return {
    ...(doc?.model === undefined ? {} : { model: doc.model }),
    ...(doc?.promptVersion === undefined ? {} : { promptVersion: doc.promptVersion }),
  };
}

/** What DeepSeek sees: our worded figures and where in the month we are, nothing else. */
function tipsInput(facts: readonly TipFact[], nowMs: number): TipsInput {
  const month = monthRange(nowMs, 0);
  return {
    facts: facts.map((f) => ({
      id: f.id,
      kind: f.kind,
      ...(f.sector === undefined ? {} : { sectorLabel: SECTOR_LABELS[f.sector] }),
      headline: f.headline,
      detail: f.detail,
    })),
    dayOfMonth: Number(dhakaDay(nowMs).slice(8, 10)),
    daysInMonth: Number(dhakaDay(month.toMs).slice(8, 10)),
  };
}
