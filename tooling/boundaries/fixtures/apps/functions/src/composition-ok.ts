import { CreateAccount } from "@moneytrace/application";
import { COMMANDS } from "@moneytrace/contracts";
import { asOwnerId } from "@moneytrace/domain";
import { SystemClock } from "@moneytrace/infrastructure";
import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
export const t = [CreateAccount, COMMANDS, asOwnerId, SystemClock, getFirestore, onCall];
