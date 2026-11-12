import type { AccountId, AccountRef, ConfidenceConfig, OwnerId } from "@moneytrace/domain";
import { asAccountId } from "@moneytrace/domain";
import type { AccountRepository } from "../../ports/account-repository";
import type { Clock } from "../../ports/clock";
import type { Logger } from "../../ports/logger";
import type { PaymentInstrumentRepository } from "../../ports/payment-instrument-repository";
import type {
  SourceEventRecord,
  SourceEventRepository,
  StageClaim,
  StageCommit,
} from "../../ports/source-event-repository";
import type { UserProfileDefaults } from "../../ports/user-profile-repository";
import type { LedgerReader } from "../../ports/ledger-reader";
import type { PostTransaction } from "../../use-cases/post-transaction";
import type { ReverseAndReplace } from "../../use-cases/reverse-and-replace";
import type { AIGateway } from "../ai-gateway";
import type { LedgerCandidateReader } from "../candidate-reader";

export type PipelineDeps = {
  sourceEvents: SourceEventRepository;
  clock: Clock;
  logger: Logger;
  accounts: AccountRepository;
  instruments: PaymentInstrumentRepository;
  candidates: LedgerCandidateReader;
  gateway: AIGateway;
  post: PostTransaction;
  /** Turns the other half of an own transfer into the transfer (CR-008), as a reversal and replacement. */
  correct: Pick<ReverseAndReplace, "execute">;
  ledger: LedgerReader;
  profiles: { get(ownerId: OwnerId): Promise<UserProfileDefaults | null> };
  confidence: ConfidenceConfig;
};

export type Stage = (
  deps: PipelineDeps,
  ownerId: OwnerId,
  event: SourceEventRecord,
  claim: StageClaim,
) => Promise<StageCommit | "retryLater">;

/** The account as the ledger refers to it, or null if it is missing or closed. */
export async function accountRef(
  deps: PipelineDeps,
  ownerId: OwnerId,
  id: string | null,
): Promise<AccountRef | null> {
  if (id === null) return null;
  const accountId: AccountId = asAccountId(id);
  const [record] = await deps.accounts.getMany(ownerId, [accountId]);
  if (record === undefined || record.status !== "active") return null;
  return { id: record.id, kind: record.kind, currency: record.currency };
}
