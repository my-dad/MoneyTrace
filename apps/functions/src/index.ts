import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "./callable/create-callable";
import { COMMAND_HANDLERS as C } from "./callable/registry";
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

export const bootstrapUser = createCallable(C.bootstrapUser, getDeps);
export const createAccount = createCallable(C.createAccount, getDeps);
export const createPaymentInstrument = createCallable(C.createPaymentInstrument, getDeps);
export const recordOpeningBalance = createCallable(C.recordOpeningBalance, getDeps);
export const resolveFollowUp = createCallable(C.resolveFollowUp, getDeps);
export const snoozeFollowUp = createCallable(C.snoozeFollowUp, getDeps);
export const recordCustodyTransfer = createCallable(C.recordCustodyTransfer, getDeps);
export const correctTransaction = createCallable(C.correctTransaction, getDeps);
export const updateSettings = createCallable(C.updateSettings, getDeps);
export const onSourceEventWritten = makeOnSourceEventWritten(getDeps);
export const recoverExpiredClaims = makeRecoverExpiredClaims(getDeps);
export const dispatchFollowUps = makeDispatchFollowUps(getDeps);
export const resumeQuotaBlockedEvents = makeResumeQuotaBlockedEvents(getDeps);
export const purgeProviderResults = makePurgeProviderResults(getDeps);
export const submitEvidence = createCallable(C.submitEvidence, getDeps);
export const confirmCandidate = createCallable(C.confirmCandidate, getDeps);
export const retrySourceEvent = createCallable(C.retrySourceEvent, getDeps);
export const answerQuestion = createCallable(C.answerQuestion, getDeps);
export const cancelSourceEvent = createCallable(C.cancelSourceEvent, getDeps);
export const recordReconciliation = createCallable(C.recordReconciliation, getDeps);
export const recordAdjustment = createCallable(C.recordAdjustment, getDeps);
export const splitTransfer = createCallable(C.splitTransfer, getDeps);
