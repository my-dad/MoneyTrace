import { z } from "zod";

/** Signed integer minor units. Floats, strings, NaN and unsafe integers are rejected. */
export const minorAmount = z.number().int();
export const positiveMinorAmount = minorAmount.positive();
export const nonNegativeMinorAmount = minorAmount.nonnegative();
export const currencyCode = z.enum(["BDT"]);
export const epochMs = z.number().int().nonnegative();
/** Same alphabet and length as the domain id brands. */
export const documentId = z.string().regex(/^[A-Za-z0-9_:.-]{1,128}$/);
/** Confidence in basis points, 0 to 10000. */
export const basisPoints = z.number().int().min(0).max(10000);
