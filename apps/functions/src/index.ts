import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { bootstrapUser as makeBootstrapUser } from "./callable/bootstrap-user";
import { createAccount as makeCreateAccount } from "./callable/create-account";
import { recordOpeningBalance as makeRecordOpeningBalance } from "./callable/record-opening-balance";
import { createPaymentInstrument as makeCreatePaymentInstrument } from "./callable/create-payment-instrument";
import {
  cancelSourceEvent as makeCancelSourceEvent,
  confirmCandidate as makeConfirmCandidate,
  retrySourceEvent as makeRetrySourceEvent,
  answerQuestion as makeAnswerQuestion,
  submitEvidence as makeSubmitEvidence,
} from "./callable/source-event-commands";
import {
  correctTransaction as makeCorrectTransaction,
  recordCustodyTransfer as makeRecordCustodyTransfer,
  resolveFollowUp as makeResolveFollowUp,
  snoozeFollowUp as makeSnoozeFollowUp,
  updateSettings as makeUpdateSettings,
} from "./callable/follow-up-commands";
import {
  recordAdjustment as makeRecordAdjustment,
  recordReconciliation as makeRecordReconciliation,
  splitTransfer as makeSplitTransfer,
} from "./callable/cash-commands";
import {
  dispatchFollowUps as makeDispatchFollowUps,
  purgeProviderResults as makePurgeProviderResults,
  recoverExpiredClaims as makeRecoverExpiredClaims,
  resumeQuotaBlockedEvents as makeResumeQuotaBlockedEvents,
} from "./schedules";
import { onSourceEventWritten as makeOnSourceEventWritten } from "./triggers/on-source-event-written";
import { fromFirestore } from "@moneytrace/infrastructure";
import { composeDeps, type Deps } from "./composition";

let deps: Deps | undefined;
/** Built on first request, so loading the bundle (deploy analysis, emulator discovery) touches nothing. */
const getDeps = (): Deps => {
  deps ??= composeDeps(fromFirestore(getFirestore(getApps()[0] ?? initializeApp())));
  return deps;
};

export const bootstrapUser = makeBootstrapUser(getDeps);
export const createAccount = makeCreateAccount(getDeps);
export const createPaymentInstrument = makeCreatePaymentInstrument(getDeps);
export const recordOpeningBalance = makeRecordOpeningBalance(getDeps);
export const resolveFollowUp = makeResolveFollowUp(getDeps);
export const snoozeFollowUp = makeSnoozeFollowUp(getDeps);
export const recordCustodyTransfer = makeRecordCustodyTransfer(getDeps);
export const correctTransaction = makeCorrectTransaction(getDeps);
export const updateSettings = makeUpdateSettings(getDeps);
export const onSourceEventWritten = makeOnSourceEventWritten(getDeps);
export const recoverExpiredClaims = makeRecoverExpiredClaims(getDeps);
export const dispatchFollowUps = makeDispatchFollowUps(getDeps);
export const resumeQuotaBlockedEvents = makeResumeQuotaBlockedEvents(getDeps);
export const purgeProviderResults = makePurgeProviderResults(getDeps);
export const submitEvidence = makeSubmitEvidence(getDeps);
export const confirmCandidate = makeConfirmCandidate(getDeps);
export const retrySourceEvent = makeRetrySourceEvent(getDeps);
export const answerQuestion = makeAnswerQuestion(getDeps);
export const cancelSourceEvent = makeCancelSourceEvent(getDeps);
export const recordReconciliation = makeRecordReconciliation(getDeps);
export const recordAdjustment = makeRecordAdjustment(getDeps);
export const splitTransfer = makeSplitTransfer(getDeps);
