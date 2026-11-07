import {
  bootstrapUserRequest,
  bootstrapUserResponse,
  createAccountRequest,
  createAccountResponse,
  createPaymentInstrumentRequest,
  createPaymentInstrumentResponse,
  recordOpeningBalanceRequest,
  recordOpeningBalanceResponse,
} from "./account";
import {
  cancelSourceEventRequest,
  cancelSourceEventResponse,
  confirmCandidateRequest,
  confirmCandidateResponse,
  resolveFollowUpRequest,
  resolveFollowUpResponse,
  retrySourceEventRequest,
  retrySourceEventResponse,
  sendChatMessageRequest,
  sendChatMessageResponse,
  snoozeFollowUpRequest,
  snoozeFollowUpResponse,
  submitEvidenceRequest,
  submitEvidenceResponse,
} from "./evidence";
import {
  correctTransactionRequest,
  correctTransactionResponse,
  recordAdjustmentRequest,
  recordAdjustmentResponse,
  recordCustodyTransferRequest,
  recordCustodyTransferResponse,
  recordReconciliationRequest,
  recordReconciliationResponse,
  upsertCashAllocationRequest,
  upsertCashAllocationResponse,
} from "./ledger";
import {
  requestAccountDeletionRequest,
  requestAccountDeletionResponse,
  requestExportRequest,
  requestExportResponse,
} from "./lifecycle";
import { updateSettingsRequest, updateSettingsResponse } from "./settings";
import {
  createUploadSessionRequest,
  createUploadSessionResponse,
  finalizeUploadRequest,
  finalizeUploadResponse,
  setOcrConsentRequest,
  setOcrConsentResponse,
} from "./upload";

/**
 * Every callable command. `phase` is the delivery phase whose handler ships. Contracts for later
 * phases exist now so clients and handlers share one definition. The owner always comes from the
 * verified Auth token, so no request carries `ownerId`.
 */
export const COMMANDS = {
  bootstrapUser: { phase: 0, request: bootstrapUserRequest, response: bootstrapUserResponse },
  createAccount: { phase: 0, request: createAccountRequest, response: createAccountResponse },
  recordOpeningBalance: {
    phase: 0,
    request: recordOpeningBalanceRequest,
    response: recordOpeningBalanceResponse,
  },
  createPaymentInstrument: {
    phase: 1,
    request: createPaymentInstrumentRequest,
    response: createPaymentInstrumentResponse,
  },
  updateSettings: { phase: 1, request: updateSettingsRequest, response: updateSettingsResponse },
  submitEvidence: { phase: 1, request: submitEvidenceRequest, response: submitEvidenceResponse },
  sendChatMessage: { phase: 3, request: sendChatMessageRequest, response: sendChatMessageResponse },
  confirmCandidate: {
    phase: 1,
    request: confirmCandidateRequest,
    response: confirmCandidateResponse,
  },
  resolveFollowUp: { phase: 1, request: resolveFollowUpRequest, response: resolveFollowUpResponse },
  snoozeFollowUp: { phase: 1, request: snoozeFollowUpRequest, response: snoozeFollowUpResponse },
  retrySourceEvent: {
    phase: 1,
    request: retrySourceEventRequest,
    response: retrySourceEventResponse,
  },
  cancelSourceEvent: {
    phase: 1,
    request: cancelSourceEventRequest,
    response: cancelSourceEventResponse,
  },
  correctTransaction: {
    phase: 1,
    request: correctTransactionRequest,
    response: correctTransactionResponse,
  },
  recordCustodyTransfer: {
    phase: 1,
    request: recordCustodyTransferRequest,
    response: recordCustodyTransferResponse,
  },
  upsertCashAllocation: {
    phase: 3,
    request: upsertCashAllocationRequest,
    response: upsertCashAllocationResponse,
  },
  createUploadSession: {
    phase: 2,
    request: createUploadSessionRequest,
    response: createUploadSessionResponse,
  },
  finalizeUpload: { phase: 2, request: finalizeUploadRequest, response: finalizeUploadResponse },
  setOcrConsent: { phase: 2, request: setOcrConsentRequest, response: setOcrConsentResponse },
  recordReconciliation: {
    phase: 3,
    request: recordReconciliationRequest,
    response: recordReconciliationResponse,
  },
  recordAdjustment: {
    phase: 3,
    request: recordAdjustmentRequest,
    response: recordAdjustmentResponse,
  },
  requestExport: { phase: 4, request: requestExportRequest, response: requestExportResponse },
  requestAccountDeletion: {
    phase: 4,
    request: requestAccountDeletionRequest,
    response: requestAccountDeletionResponse,
  },
} as const;

export type CommandName = keyof typeof COMMANDS;
