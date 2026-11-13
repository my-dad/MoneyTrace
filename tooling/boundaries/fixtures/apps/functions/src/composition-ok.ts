import { CreateAccount } from "@moneytrace/application";
import { COMMANDS } from "@moneytrace/contracts";
import { asOwnerId } from "@moneytrace/domain";
import { SystemClock } from "@moneytrace/infrastructure";
import postgres from "postgres";
export const t = [CreateAccount, COMMANDS, asOwnerId, SystemClock, postgres];
