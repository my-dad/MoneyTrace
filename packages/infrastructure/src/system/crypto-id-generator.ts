import { randomUUID } from "node:crypto";
import type { IdGenerator } from "@moneytrace/application";

export class CryptoIdGenerator implements IdGenerator {
  newId(): string {
    return randomUUID();
  }
}
