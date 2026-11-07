import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { bootstrapUser as makeBootstrapUser } from "./callable/bootstrap-user";
import { createAccount as makeCreateAccount } from "./callable/create-account";
import { recordOpeningBalance as makeRecordOpeningBalance } from "./callable/record-opening-balance";
import { composeDeps, type Deps } from "./composition";

let deps: Deps | undefined;
/** Built on first request, so loading the bundle (deploy analysis, emulator discovery) touches nothing. */
const getDeps = (): Deps => {
  deps ??= composeDeps(getFirestore(getApps()[0] ?? initializeApp()));
  return deps;
};

export const bootstrapUser = makeBootstrapUser(getDeps);
export const createAccount = makeCreateAccount(getDeps);
export const recordOpeningBalance = makeRecordOpeningBalance(getDeps);
