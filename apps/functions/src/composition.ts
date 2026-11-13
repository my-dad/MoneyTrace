import {
  AIGateway,
  AdvanceSourceEvent,
  BootstrapUser,
  DEFAULT_AI_ESTIMATE_MICRO_USD,
  DEFAULT_QUOTA_LIMITS,
  LedgerCandidateReader,
  PlannedQuotaLedger,
  ProviderCallExecutor,
  type AiPlan,
  PurgeProviderResults,
  RecoverExpiredClaims,
  ResumeQuotaBlockedEvents,
  WakeSnoozedFollowUps,
  AnswerQuestion,
  CorrectTransaction,
  ReverseAndReplace,
  PostTransaction,
  RecordCustodyTransfer,
  ResolveFollowUp,
  SnoozeFollowUp,
  UpdateSettings,
  CancelSourceEvent,
  ConfirmCandidate,
  IntakeEvidence,
  RetryProviderCall,
  RetrySourceEvent,
  CreateAccount,
  CreatePaymentInstrument,
  RecordOpeningBalance,
  RecordCashCount,
  RecordCashAdjustment,
  SplitTransfer,
  type IdGenerator,
  type Logger,
  type RateLimiter,
} from "@moneytrace/application";
import {
  CryptoIdGenerator,
  FirestoreAccountRepository,
  FirestoreFollowUpRepository,
  FirestoreReconciliationRepository,
  FirestoreAiUsageRecorder,
  FirestoreLedgerReader,
  FirestoreQuotaLedger,
  FirestoreRateLimiter,
  systemTimeoutSignal,
  FirestoreLedgerWriter,
  FirestoreProviderCallRepository,
  FirestoreSourceEventRepository,
  FirestorePaymentInstrumentRepository,
  FirestoreUserProfileRepository,
  JsonLogger,
  NodeHasher,
  PgDocStore,
  PgOwnerEraser,
  SystemClock,
} from "@moneytrace/infrastructure";
import { DEFAULT_CONFIDENCE_CONFIG } from "@moneytrace/contracts";
import type { OwnerId } from "@moneytrace/domain";
import type { DocStore } from "@moneytrace/infrastructure";
import { selectAiProvider } from "./ai-selection";
import { accessPolicyFromEnv, type AccessPolicy } from "./callable/access";
import { CALLABLE_RATE_LIMITS, EMULATOR_RATE_LIMITS, type RateLimits } from "./callable/command";

export type CallGate = { access: AccessPolicy; limiter: RateLimiter; limits: RateLimits; nowMs: () => number };

export type Deps = {
  logger: Logger;
  callGate: CallGate;
  ids: IdGenerator;
  bootstrapUser: BootstrapUser;
  createAccount: CreateAccount;
  createPaymentInstrument: CreatePaymentInstrument;
  recordOpeningBalance: RecordOpeningBalance;
  intakeEvidence: IntakeEvidence;
  confirmCandidate: ConfirmCandidate;
  retrySourceEvent: RetrySourceEvent;
  answerQuestion: AnswerQuestion;
  cancelSourceEvent: CancelSourceEvent;
  resolveFollowUp: ResolveFollowUp;
  snoozeFollowUp: SnoozeFollowUp;
  recordCustodyTransfer: RecordCustodyTransfer;
  correctTransaction: CorrectTransaction;
  recordCashCount: RecordCashCount;
  recordCashAdjustment: RecordCashAdjustment;
  splitTransfer: SplitTransfer;
  updateSettings: UpdateSettings;
  advanceSourceEvent: AdvanceSourceEvent;
  recoverExpiredClaims: RecoverExpiredClaims;
  wakeSnoozedFollowUps: WakeSnoozedFollowUps;
  resumeQuotaBlockedEvents: ResumeQuotaBlockedEvents;
  purgeProviderResults: PurgeProviderResults;
  /** Each user's AI plan (CR-009): the owner is recognised by OWNER_EMAIL at first sign-in. */
  aiPlans: { planOf(ownerId: OwnerId): Promise<AiPlan>; markOwner(ownerId: OwnerId): Promise<void> };
  /** Lower-cased OWNER_EMAIL, or undefined when unset (then everyone is a member). */
  ownerEmail: string | undefined;
  /** Erases an owner's data and login, verified (CR-009). Undefined on Firebase. */
  accountDeletion: { erase(ownerId: OwnerId): Promise<string> } | undefined;
  /** Unclaimed events waiting for a stage, oldest first (the Supabase backend's trigger sweep). */
  runnableEvents: FirestoreSourceEventRepository["listRunnable"];
};

/** The only place adapters are wired to ports. */
/** What only the hosting platform can do. */
export type Platform = { deleteAuthUser?: (uid: string) => Promise<void> };

export function composeDeps(
  db: DocStore,
  env: Readonly<Record<string, string | undefined>> = process.env,
  platform: Platform = {},
): Deps {
  const clock = new SystemClock();
  const ids = new CryptoIdGenerator();
  const hasher = new NodeHasher();
  const accounts = new FirestoreAccountRepository(db, clock);
  const reader = new FirestoreLedgerReader(db, clock);
  const writer = new FirestoreLedgerWriter(db, clock);
  const profiles = new FirestoreUserProfileRepository(db);
  const logger = new JsonLogger((line) => {
    console.log(line);
  });
  const sourceEvents = new FirestoreSourceEventRepository(db, clock, logger);
  const providerCalls = new FirestoreProviderCallRepository(db, clock);
  const followUps = new FirestoreFollowUpRepository(db);
  const reconciliations = new FirestoreReconciliationRepository(db);
  const post = new PostTransaction({ writer, accounts, hasher, clock });
  let advance: AdvanceSourceEvent | undefined;
  const plans = new Map<string, AiPlan>();
  const aiPlans: Deps["aiPlans"] = {
    async planOf(ownerId) {
      let plan = plans.get(ownerId);
      if (plan === undefined) {
        const snap = await db.doc(`aiPlans/${String(ownerId)}`).get();
        plan = snap.get("plan") === "owner" ? "owner" : "member";
        plans.set(ownerId, plan);
      }
      return plan;
    },
    async markOwner(ownerId) {
      await db.doc(`aiPlans/${String(ownerId)}`).set({ plan: "owner" });
      plans.set(ownerId, "owner");
    },
  };
  const ownerEmail = (env["OWNER_EMAIL"] ?? "").trim().toLowerCase();
  const quota = new PlannedQuotaLedger({
    inner: new FirestoreQuotaLedger(db, clock, ids),
    planOf: (ownerId) => aiPlans.planOf(ownerId),
    globalMonthlyMicroUsd: Number(env["GLOBAL_AI_CAP_MICRO_USD"] ?? "") || 10_000_000,
  });
  const usage = new FirestoreAiUsageRecorder(db);
  const instruments = new FirestorePaymentInstrumentRepository(db);
  const deleteAuthUser = platform.deleteAuthUser;
  const accountDeletion: Deps["accountDeletion"] =
    db instanceof PgDocStore && deleteAuthUser !== undefined
      ? {
          async erase(ownerId) {
            const eraser = new PgOwnerEraser(db.client);
            await eraser.erase(ownerId);
            await deleteAuthUser(ownerId);
            // Work already in flight (an SMS still being read) may write after the first pass, so
            // erase in rounds until nothing is left. The login is gone, so nothing new can start.
            let left = 1;
            for (let round = 0; round < 6 && left > 0; round++) {
              if (round > 0) await new Promise((r) => setTimeout(r, 150 * 2 ** round));
              await eraser.erase(ownerId);
              left = await eraser.remaining(ownerId);
            }
            if (left !== 0) throw new Error("account deletion not verified");
            const ownerIdHash = hasher.sha256(ownerId);
            await db.doc(`deletionLog/${ownerIdHash}`).set({ ownerIdHash, deletedAtMs: clock.nowMs() });
            plans.delete(ownerId);
            return `del-${ownerIdHash.slice(0, 32)}`;
          },
        }
      : undefined;
  return {
    logger,
    aiPlans,
    accountDeletion,
    ownerEmail: ownerEmail === "" ? undefined : ownerEmail,
    callGate: {
      access: accessPolicyFromEnv(env),
      limiter: new FirestoreRateLimiter(db),
      limits: env["FUNCTIONS_EMULATOR"] === "true" ? EMULATOR_RATE_LIMITS : CALLABLE_RATE_LIMITS,
      nowMs: () => clock.nowMs(),
    },
    // Built on first use: only the pipeline trigger has the AI key, not every callable.
    get advanceSourceEvent() {
      advance ??= new AdvanceSourceEvent({
        sourceEvents,
        clock,
        logger,
        accounts,
        instruments,
        candidates: new LedgerCandidateReader(reader),
        gateway: new AIGateway(
          new ProviderCallExecutor({
            providerCalls,
            quota,
            usage,
            clock,
            logger,
            timeoutSignal: systemTimeoutSignal,
          }),
          selectAiProvider(env),
          DEFAULT_AI_ESTIMATE_MICRO_USD,
        ),
        post,
        correct: new ReverseAndReplace({ writer, reader, accounts, hasher, clock }),
        ledger: reader,
        profiles,
        confidence: DEFAULT_CONFIDENCE_CONFIG,
      });
      return advance;
    },
    recoverExpiredClaims: new RecoverExpiredClaims({
      sourceEvents,
      providerCalls,
      usage,
      clock,
      logger,
    }),
    wakeSnoozedFollowUps: new WakeSnoozedFollowUps({ followUps, logger }),
    resumeQuotaBlockedEvents: new ResumeQuotaBlockedEvents({
      sourceEvents,
      quota,
      clock,
      limits: DEFAULT_QUOTA_LIMITS,
      estimateMicroUsd: DEFAULT_AI_ESTIMATE_MICRO_USD,
    }),
    purgeProviderResults: new PurgeProviderResults({ providerCalls, logger }),
    runnableEvents: (limit) => sourceEvents.listRunnable(limit),
    resolveFollowUp: new ResolveFollowUp({ followUps, reader, accounts, post, clock }),
    snoozeFollowUp: new SnoozeFollowUp({ followUps, clock }),
    recordCustodyTransfer: new RecordCustodyTransfer({ accounts, post }),
    correctTransaction: new CorrectTransaction({ reader, writer, accounts, hasher, clock }),
    recordCashCount: new RecordCashCount({ accounts, reader, reconciliations, followUps, clock }),
    recordCashAdjustment: new RecordCashAdjustment({ reconciliations, followUps, accounts, reader, post, clock }),
    splitTransfer: new SplitTransfer({ sourceEvents, reader, writer, accounts, hasher, clock }),
    updateSettings: new UpdateSettings({ profiles }),
    intakeEvidence: new IntakeEvidence({ sourceEvents, hasher, ids, clock, logger }),
    confirmCandidate: new ConfirmCandidate({ sourceEvents, accounts, clock }),
    answerQuestion: new AnswerQuestion({ sourceEvents, clock }),
    retrySourceEvent: new RetrySourceEvent({
      sourceEvents,
      retryProvider: new RetryProviderCall({ sourceEvents, providerCalls, clock }),
      clock,
    }),
    cancelSourceEvent: new CancelSourceEvent({ sourceEvents, clock }),
    ids,
    bootstrapUser: new BootstrapUser({ profiles, accounts, clock }),
    createAccount: new CreateAccount({ accounts, ids, clock }),
    createPaymentInstrument: new CreatePaymentInstrument({
      accounts,
      instruments,
      ids,
      clock,
    }),
    recordOpeningBalance: new RecordOpeningBalance({ writer, reader, accounts, hasher, clock }),
  };
}
