import type { AccountRow } from "../../shared/read-model-gateway";

/** The server's holding wallet for unplaced cash. Nobody can choose it as an answer. */
const SYSTEM_CASH_ACCOUNT_ID = "cash-unassigned";

const usable = (accounts: AccountRow[]) =>
  accounts.filter((account) => account.status === "active" && account.id !== SYSTEM_CASH_ACCOUNT_ID);

export const anyAccount = usable;

/** Accounts a transfer can move between: banks and wallets, and the user's own cash (a withdrawal). */
export const transferAccounts = (accounts: AccountRow[]) =>
  usable(accounts).filter((account) => account.kind === "bank" || account.kind === "cash");

export const bankAccounts = (accounts: AccountRow[]) =>
  usable(accounts).filter((account) => account.kind === "bank");

export const cashPlaces = (accounts: AccountRow[]) =>
  usable(accounts).filter((account) => account.kind === "cash" || account.kind === "familyCash");
