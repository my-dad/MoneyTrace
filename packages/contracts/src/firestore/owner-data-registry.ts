import type { OwnerCollectionName } from "./collections";

export type RetentionClass =
  "untilAccountDeletion" | "providerResult" | "conversation" | "temporaryUpload";

export type OwnerDataEntry = {
  retentionClass: RetentionClass;
  exportTreatment: "included" | "excluded";
  clientRead: boolean;
};

const keep = (clientRead = true): OwnerDataEntry => ({
  retentionClass: "untilAccountDeletion",
  exportTreatment: "included",
  clientRead,
});

export const OWNER_DATA_REGISTRY: Record<OwnerCollectionName, OwnerDataEntry> = {
  accounts: keep(),
  paymentInstruments: keep(),
  sourceEvents: keep(),
  providerCalls: { ...keep(false), retentionClass: "providerResult" },
  transactions: keep(),
  ledgerEntries: keep(),
  balances: keep(),
  idempotencyRecords: { ...keep(false), exportTreatment: "excluded" },
  cutoverMarkers: keep(),
  decisionRecords: keep(),
  cashAllocations: keep(),
  reconciliations: keep(),
  followUps: keep(),
  conversations: { ...keep(), retentionClass: "conversation" },
  conversationMessages: { ...keep(), retentionClass: "conversation" },
  aiUsage: keep(),
  quotaCounters: keep(false),
  temporaryUploads: { ...keep(), retentionClass: "temporaryUpload" },
  consents: keep(),
  deletionJobs: keep(false),
};
