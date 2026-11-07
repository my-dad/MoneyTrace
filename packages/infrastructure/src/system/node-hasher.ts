import { createHash } from "node:crypto";
import type { Hasher } from "@moneytrace/application";

export class NodeHasher implements Hasher {
  sha256(text: string): string {
    return createHash("sha256").update(text, "utf8").digest("hex");
  }
}
