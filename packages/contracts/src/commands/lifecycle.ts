import { z } from "zod";
import { documentId } from "../primitives";
import { strictObject } from "./shared";

export const requestExportRequest = strictObject({});
export const requestExportResponse = strictObject({ requestId: documentId });

export const ACCOUNT_DELETION_CONFIRMATION = "DELETE MY ACCOUNT";
export const requestAccountDeletionRequest = strictObject({
  confirmation: z.literal(ACCOUNT_DELETION_CONFIRMATION),
});
export const requestAccountDeletionResponse = strictObject({ requestId: documentId });
