import { z } from "zod";
import { currencyCode, documentId, epochMs, minorAmount } from "../primitives";
import { accountName, strictObject } from "./shared";

export const bootstrapUserRequest = strictObject({});
export const bootstrapUserResponse = strictObject({ created: z.boolean() });

export const createAccountRequest = strictObject({
  kind: z.enum(["bank", "cash", "familyCash", "creditLiability"]),
  name: accountName,
  currency: currencyCode,
});
export const createAccountResponse = strictObject({ accountId: documentId });

/** A dated position, signed. Positive asset: funds held. Positive liability: amount owed. Negative flips each. */
export const recordOpeningBalanceRequest = strictObject({
  accountId: documentId,
  amountMinor: minorAmount,
  currency: currencyCode,
  effectiveAtMs: epochMs,
});
export const recordOpeningBalanceResponse = strictObject({
  transactionId: documentId,
  status: z.enum(["recorded", "alreadyRecorded"]),
});

export const createPaymentInstrumentRequest = strictObject({
  accountId: documentId,
  provider: z.enum(["bkash", "brac", "mtb", "stanchart", "trustbank", "ucb", "upay", "other"]),
  /** The last 3 or 4 digits only; empty for a mobile wallet. */
  maskedIdentifier: z.string().regex(/^(\d{3,4})?$/),
  type: z.enum(["debitCard", "creditCard", "mobileWallet", "bankAccount"]),
});
export const createPaymentInstrumentResponse = strictObject({ instrumentId: documentId });
