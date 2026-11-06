import { DomainError } from "./errors";

const ID_PATTERN = /^[A-Za-z0-9_:.-]{1,128}$/;

declare const brand: unique symbol;
type Brand<B extends string> = string & { readonly [brand]: B };

export type OwnerId = Brand<"OwnerId">;
export type AccountId = Brand<"AccountId">;
export type TransactionId = Brand<"TransactionId">;
export type SourceEventId = Brand<"SourceEventId">;
export type IdempotencyKey = Brand<"IdempotencyKey">;

function validate(kind: string, s: unknown): string {
  if (typeof s !== "string" || !ID_PATTERN.test(s)) {
    throw new DomainError("invalidId", `invalid ${kind}`);
  }
  return s;
}

export const asOwnerId = (s: string): OwnerId => validate("OwnerId", s) as OwnerId;
export const asAccountId = (s: string): AccountId => validate("AccountId", s) as AccountId;
export const asTransactionId = (s: string): TransactionId =>
  validate("TransactionId", s) as TransactionId;
export const asSourceEventId = (s: string): SourceEventId =>
  validate("SourceEventId", s) as SourceEventId;
export const asIdempotencyKey = (s: string): IdempotencyKey =>
  validate("IdempotencyKey", s) as IdempotencyKey;
