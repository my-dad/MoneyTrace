import { z } from "zod";
import { documentId, epochMs } from "../primitives";
import { strictObject, UPLOAD_MAX_BYTES, UPLOAD_MIME_TYPES } from "./shared";

export const createUploadSessionRequest = strictObject({
  mimeType: z.enum(UPLOAD_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(UPLOAD_MAX_BYTES),
});
export const createUploadSessionResponse = strictObject({
  uploadId: documentId,
  uploadPath: z.string().min(1).max(512),
  expiresAtMs: epochMs,
});

export const finalizeUploadRequest = strictObject({
  uploadId: documentId,
  idempotencyKey: documentId,
});
export const finalizeUploadResponse = strictObject({
  sourceEventId: documentId,
  duplicate: z.boolean(),
});

export const setOcrConsentRequest = strictObject({
  consentVersion: z.number().int().positive(),
  granted: z.boolean(),
});
export const setOcrConsentResponse = strictObject({ granted: z.boolean() });
