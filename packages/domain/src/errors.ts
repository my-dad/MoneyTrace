export type DomainErrorCode =
  | "invalidMoney"
  | "currencyMismatch"
  | "unbalancedEntries"
  | "invalidIntent"
  | "invalidTransition"
  | "invalidId"
  | "invalidDate"
  | "beforeCutover"
  | "accountInvalid"
  | "invalidConfig";

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
