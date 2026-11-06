import { z } from "zod";

/** Evidence and chat text cap. Matches the product limit for text-bearing evidence fields. */
export const MAX_EVIDENCE_TEXT_CHARS = 10_000;
export const evidenceText = z.string().min(1).max(MAX_EVIDENCE_TEXT_CHARS);
/** Short human text: names, purposes, causes, rationales. */
export const shortText = z.string().min(1).max(2000);
export const accountName = z.string().min(1).max(200);

/** Same values as `storage.rules` (Task 7). */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

/** Every request is a strict object, so an `ownerId` or any other unknown field is rejected. */
export const strictObject = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
export const emptyObject = strictObject({});
