import { dhakaDay, FORCED_TIPS_PER_DAY, monthRange, SECTOR_LABELS, SYSTEM_CASH_ACCOUNT_ID, type TipFact } from "@moneytrace/contracts";
import { asAccountId, type OwnerId } from "@moneytrace/domain";
import type { AIGateway } from "../pipeline/ai-gateway";
import { PIPELINE_TIMEOUTS } from "../pipeline/timeouts";
import type { TipsInput } from "../ports/ai-provider";
import type { Clock } from "../ports/clock";
import type { Hasher } from "../ports/hasher";
import type { LedgerReader } from "../ports/ledger-reader";
import type { Logger } from "../ports/logger";
import type { TipsDoc, TipsFields, TipsRepository } from "../ports/tips-repository";
import { tipFacts } from "../tips/tip-facts";
import { validateAdvice } from "../tips/validate-advice";

/** How long an automatic AI call holds its claim: past the function's own time limit, so it has ended. */
const AI_CALL_CLAIM_MS = PIPELINE_TIMEOUTS.functionExecutionTimeoutMs;

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
    const month7 = today.slice(0, 7);

    if (result.status === "notEnoughData") {
      await tips.update(ownerId, (current) =>
        current !== null && current.generatedAtMs > nowMs
          ? null
          : { ...carried(current), month: month7, generatedAtMs: nowMs, status: "notEnoughData", waitingFor: result.waitingFor, facts: [], advice: {}, factsHash: null },
      );
      return this.done("notEnoughData", 0);
    }

    const { facts } = result;
    const factsHash = this.deps.hasher.sha256(JSON.stringify(facts.map((f) => [f.id, f.amountMinor, f.compareMinor ?? null])));
    const save = { written: false };
    // Inside the transaction: advice is kept from what is stored now, and figures saved by a later
    // refresh are never replaced with these older ones.
    const stored = await tips.update(ownerId, (current) => {
      if (current !== null && current.generatedAtMs > nowMs) return null;
      save.written = true;
      const kept = adviceFor(facts, current?.advice ?? {});
      const keptStatus = current?.status === "ready" && Object.keys(kept).length > 0 ? "ready" : "factsOnly";
      return { ...carried(current), month: month7, generatedAtMs: nowMs, status: facts.length === 0 ? "ready" : keptStatus, facts, advice: kept, factsHash };
    });
    if (!save.written || stored === null) return this.done("unchanged", facts.length);
    if (facts.length === 0) return this.done("unchanged", 0);

    let requestKey = `tips-${today}-auto`;
    if (force) {
      const n = await tips.claimForced(ownerId, today, FORCED_TIPS_PER_DAY);
      if (n === null) return this.done("limitReached", facts.length);
      requestKey = `tips-${today}-new-${String(n)}`;
    } else if (stored.aiDay === today || stored.aiFactsHash === factsHash) {
      return this.done("unchanged", facts.length);
    } else if (!(await this.claimAutoCall(ownerId, nowMs, today))) {
      // Another tab is making today's tips (or just made them): it saves them for both.
      return this.done("unchanged", facts.length);
    }
    const claimed = !force;

    let call: Awaited<ReturnType<TipsWriter["writeTips"]>>;
    try {
      call = await this.deps.writer.writeTips(ownerId, requestKey, tipsInput(facts, nowMs));
    } catch (error) {
      // No AI (no key, a store error around the call): the saved figures stand; a later open retries.
      this.deps.logger.error("tips.adviceFailed", { errorName: error instanceof Error ? error.name : "unknown" });
      await this.finish(ownerId, claimed, null, {});
      return this.done("factsOnly", facts.length);
    }
    const called = call.kind === "quotaExhausted" ? null : { aiDay: today, aiFactsHash: factsHash };
    const advice = call.kind === "result" ? validateAdvice(call.value, facts) : {};
    if (Object.keys(advice).length === 0) {
      await this.finish(ownerId, claimed, called, {});
      return this.done("factsOnly", facts.length);
    }
    await this.finish(ownerId, claimed, called, advice, { adviceAtMs: nowMs, ...this.deps.writer.tipsIdentity });
    return this.done("made", facts.length);
  }

  /**
   * Stores the AI call's outcome on whatever is stored now: the figures stay the newest saved (a
   * refresh may have finished meanwhile), and new advice is kept for the facts still shown.
   */
  /** Claims the day's automatic AI call, unless one is running or today's was already made. */
  private async claimAutoCall(ownerId: OwnerId, nowMs: number, today: string): Promise<boolean> {
    const claim = { ok: false };
    await this.deps.tips.update(ownerId, (current) => {
      if (current === null || current.aiDay === today || (current.aiCallUntilMs ?? 0) > nowMs) return null;
      claim.ok = true;
      return { ...current, aiCallUntilMs: nowMs + AI_CALL_CLAIM_MS };
    });
    return claim.ok;
  }

  private async finish(
    ownerId: OwnerId,
    claimed: boolean,
    called: { aiDay: string; aiFactsHash: string } | null,
    advice: Record<string, string>,
    made?: { adviceAtMs: number; model: string; promptVersion: string },
  ): Promise<void> {
    await this.deps.tips.update(ownerId, (current) => {
      if (current === null) return null;
      const merged = adviceFor(current.facts, { ...current.advice, ...advice });
      const fresh = Object.keys(adviceFor(current.facts, advice)).length > 0;
      // The stored id and New tips count are the repository's to keep; it overrides them.
      return {
        ...current,
        ...(called ?? {}),
        ...(fresh && made !== undefined ? made : {}),
        ...(claimed ? { aiCallUntilMs: null } : {}),
        advice: merged,
        status: fresh ? "ready" : "factsOnly",
      };
    });
  }

  /** The outcome only: tip text and amounts never reach the logs. */
  private done(outcome: RefreshTipsOutcome, factCount: number): RefreshTipsOutcome {
    this.deps.logger.info("tips.refreshed", { outcome, factCount });
    return outcome;
  }
}

/** What a figures save carries over from the stored document: the last AI call and its advice's origin. */
function carried(doc: TipsDoc | null): Pick<TipsFields, "aiDay" | "aiFactsHash" | "adviceAtMs" | "aiCallUntilMs" | "model" | "promptVersion"> {
  return {
    aiDay: doc?.aiDay ?? null,
    aiCallUntilMs: doc?.aiCallUntilMs ?? null,
    aiFactsHash: doc?.aiFactsHash ?? null,
    adviceAtMs: doc?.adviceAtMs ?? null,
    ...(doc?.model === undefined ? {} : { model: doc.model }),
    ...(doc?.promptVersion === undefined ? {} : { promptVersion: doc.promptVersion }),
  };
}

/** The advice for these facts only. */
function adviceFor(facts: readonly TipFact[], advice: Record<string, string>): Record<string, string> {
  return Object.fromEntries(facts.flatMap((f) => (advice[f.id] === undefined ? [] : [[f.id, advice[f.id]]]))) as Record<string, string>;
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
