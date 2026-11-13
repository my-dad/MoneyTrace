import { bootstrapUser } from "./bootstrap-user";
import { recordAdjustment, recordReconciliation, splitTransfer } from "./cash-commands";
import { createAccount } from "./create-account";
import { createPaymentInstrument } from "./create-payment-instrument";
import { correctTransaction, recordCustodyTransfer, resolveFollowUp, snoozeFollowUp, updateSettings } from "./follow-up-commands";
import { recordOpeningBalance } from "./record-opening-balance";
import { answerQuestion, cancelSourceEvent, confirmCandidate, retrySourceEvent, submitEvidence } from "./source-event-commands";

/** Every command a client can call, by its contract name. Firebase and `/api` both serve this map. */
export const COMMAND_HANDLERS = {
  bootstrapUser,
  createAccount,
  createPaymentInstrument,
  recordOpeningBalance,
  resolveFollowUp,
  snoozeFollowUp,
  recordCustodyTransfer,
  correctTransaction,
  updateSettings,
  submitEvidence,
  confirmCandidate,
  retrySourceEvent,
  answerQuestion,
  cancelSourceEvent,
  recordReconciliation,
  recordAdjustment,
  splitTransfer,
} as const;

export type CommandName = keyof typeof COMMAND_HANDLERS;
