import {
  AIGateway,
  AdvanceSourceEvent,
  BootstrapUser,
  DEFAULT_AI_ESTIMATE_MICRO_USD,
  DEFAULT_QUOTA_LIMITS,
  LedgerCandidateReader,
  ProviderCallExecutor,
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
  type IdGenerator,
  type Logger,
  type RateLimiter,
} from "@moneytrace/application";
import {
  CryptoIdGenerator,
  FirestoreAccountRepository,
  FirestoreFollowUpRepository,
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
  SystemClock,
} from "@moneytrace/infrastructure";
import { DEFAULT_CONFIDENCE_CONFIG } from "@moneytrace/contracts";
import type { Firestore } from "firebase-admin/firestore";
import { selectAiProvider } from "./ai-selection";
import { accessPolicyFromEnv, type AccessPolicy } from "./callable/access";
import { CALLABLE_RATE_LIMITS, EMULATOR_RATE_LIMITS, type RateLimits } from "./callable/create-callable";

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
  updateSettings: UpdateSettings;
  advanceSourceEvent: AdvanceSourceEvent;
  recoverExpiredClaims: RecoverExpiredClaims;
  wakeSnoozedFollowUps: WakeSnoozedFollowUps;
  resumeQuotaBlockedEvents: ResumeQuotaBlockedEvents;
  purgeProviderResults: PurgeProviderResults;
};

/** The only place adapters are wired to ports. */
export function composeDeps(db: Firestore): Deps {
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
  const post = new PostTransaction({ writer, accounts, hasher, clock });
  let advance: AdvanceSourceEvent | undefined;
  const quota = new FirestoreQuotaLedger(db, clock, ids);
  const usage = new FirestoreAiUsageRecorder(db);
  const instruments = new FirestorePaymentInstrumentRepository(db);
  return {
    logger,
    callGate: {
      access: accessPolicyFromEnv(process.env),
      limiter: new FirestoreRateLimiter(db),
      limits: process.env["FUNCTIONS_EMULATOR"] === "true" ? EMULATOR_RATE_LIMITS : CALLABLE_RATE_LIMITS,
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
          selectAiProvider(process.env),
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
    resolveFollowUp: new ResolveFollowUp({ followUps, reader, accounts, post, clock }),
    snoozeFollowUp: new SnoozeFollowUp({ followUps, clock }),
    recordCustodyTransfer: new RecordCustodyTransfer({ accounts, post }),
    correctTransaction: new CorrectTransaction({ reader, writer, accounts, hasher, clock }),
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
