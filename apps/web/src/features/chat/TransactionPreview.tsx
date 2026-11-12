import { formatBdt } from "@moneytrace/contracts";
import { Button, Card, Chip, FormField, MoneyText, StatusBadge } from "@moneytrace/ui-kit";
import { useState } from "react";
import type { Commands, CommandRequest } from "../../shared/commands";
import { CHAT_COPY, COPY } from "../../shared/copy";
import { dhakaDate, dhakaDayStartMs, isDateText } from "../../shared/dhaka-date";
import { parseBdtInput } from "../../shared/parse-bdt-input";
import type { AccountRow, SourceEventRow } from "../../shared/read-model-gateway";
import { anyAccount, bankAccounts, transferAccounts } from "./chat-accounts";
import styles from "./chat.module.css";
import { useAction } from "../../shared/use-action";

type Candidate = NonNullable<SourceEventRow["candidate"]>;
type Overrides = NonNullable<CommandRequest<"confirmCandidate">["overrides"]>;
type KindChoice = "known" | "transfer" | "other";

const TIMEZONE = "Asia/Dhaka";

const dhakaDateTime = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ms));

const amountText = ({ amountMinor, currency }: Candidate) =>
  currency === "BDT" ? formatBdt(amountMinor) : formatBdt(amountMinor).replace("৳", `${currency} `);

const accountName = (accounts: AccountRow[], id: string | null) =>
  accounts.find((account) => account.id === id)?.name;

export function TransactionPreview({
  event,
  accounts,
  confirmCandidate,
}: {
  event: SourceEventRow;
  accounts: AccountRow[];
  confirmCandidate: Commands["confirmCandidate"];
}) {
  const { busy, failed, run } = useAction();
  const candidate = event.candidate;

  const decide = (decision: "reject" | "link") => {
    void run(() => confirmCandidate({ sourceEventId: event.id, decision }));
  };
  const rejectButton = (
    <Button
      variant="secondary"
      disabled={busy}
      onClick={() => {
        decide("reject");
      }}
    >
      {CHAT_COPY.reject}
    </Button>
  );
  const failure = failed && (
    <p role="alert" className={styles.error}>
      {CHAT_COPY.answerFailed}
    </p>
  );

  if (candidate === null) {
    return (
      <Card as="section" aria-label={CHAT_COPY.notSavedYet}>
        <p className={styles.note}>{CHAT_COPY.unreadable}</p>
        <div className={styles.actions}>{rejectButton}</div>
        {failure}
      </Card>
    );
  }

  return (
    <CandidateForm
      event={event}
      candidate={candidate}
      accounts={accounts}
      busy={busy}
      rejectButton={rejectButton}
      failure={failure}
      onLink={() => {
        decide("link");
      }}
      onConfirm={(overrides) => {
        void run(() =>
          confirmCandidate({
            sourceEventId: event.id,
            decision: "confirm",
            ...(overrides === null ? {} : { overrides }),
          }),
        );
      }}
    />
  );
}

function CandidateForm({
  event,
  candidate,
  accounts,
  busy,
  rejectButton,
  failure,
  onLink,
  onConfirm,
}: {
  event: SourceEventRow;
  candidate: Candidate;
  accounts: AccountRow[];
  busy: boolean;
  rejectButton: React.ReactNode;
  failure: React.ReactNode;
  onLink: () => void;
  onConfirm: (overrides: Overrides | null) => void;
}) {
  const incoming = candidate.kind === "unclassifiedCredit";
  const unclassified = incoming || candidate.kind === "unclassifiedDebit";
  const knownKind = incoming ? "income" : "purchase";
  const pasteDate = dhakaDate(event.receivedAtMs);

  const [kindChoice, setKindChoice] = useState<KindChoice | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [otherAccountId, setOtherAccountId] = useState<string | null>(null);
  const [takaText, setTakaText] = useState("");
  const [dateText, setDateText] = useState(pasteDate);

  const askAccount = event.resolvedAccountId === null;
  const smsAccountId = event.resolvedAccountId ?? accountId;
  const foreign = candidate.currency !== "BDT";
  const undated = candidate.occurredAtMs === null;
  const needsDestination =
    (candidate.kind === "transfer" || candidate.kind === "cardRepayment") &&
    event.resolvedDestinationAccountId === null;
  const asksOtherAccount = kindChoice === "transfer" || needsDestination;
  const isLinkable = event.matchKind === "possibleCounterpart" || event.matchKind === "ambiguous";
  const notAnExpense =
    candidate.kind === "withdrawal" || candidate.kind === "transfer" || kindChoice === "transfer";

  const otherOptions = (
    candidate.kind === "cardRepayment" ? bankAccounts(accounts) : transferAccounts(accounts)
  ).filter((account) => account.id !== smsAccountId);

  const takaMinor = parseBdtInput(takaText);
  const dateValid = isDateText(dateText) && dateText <= pasteDate;

  const complete =
    (!unclassified || kindChoice === "known" || kindChoice === "transfer") &&
    smsAccountId !== null &&
    (!asksOtherAccount || otherAccountId !== null) &&
    (!foreign || takaMinor !== null) &&
    (!undated || dateValid);

  function overrides(): Overrides | null {
    const result: Overrides = {};
    if (kindChoice === "known") result.kind = knownKind;
    if (kindChoice === "transfer") result.kind = "transfer";
    if (askAccount && accountId !== null) result.accountId = accountId;
    if (asksOtherAccount && otherAccountId !== null) {
      // Money that came in left the other account and landed in the one the SMS is about.
      if (incoming && smsAccountId !== null) {
        result.accountId = otherAccountId;
        result.destinationAccountId = smsAccountId;
      } else {
        result.destinationAccountId = otherAccountId;
      }
    }
    if (foreign && takaMinor !== null) {
      result.amountMinor = takaMinor;
      result.currency = "BDT";
    }
    if (undated) {
      result.occurredAtMs =
        dateText === pasteDate ? event.receivedAtMs : dhakaDayStartMs(dateText);
    }
    return Object.keys(result).length === 0 ? null : result;
  }

  const account = accountName(accounts, smsAccountId);
  const destination = accountName(accounts, event.resolvedDestinationAccountId);

  return (
    <Card as="section" aria-label={CHAT_COPY.kindTitle[candidate.kind]}>
      <div className={styles.previewTop}>
        <StatusBadge status="pending" label={CHAT_COPY.notSavedYet} />
      </div>
      <div className={styles.previewHead}>
        <h2 className={styles.previewTitle}>{CHAT_COPY.kindTitle[candidate.kind]}</h2>
        <p className={styles.previewAmount}>
          <MoneyText text={amountText(candidate)} />
        </p>
        {notAnExpense && <p className={styles.note}>{COPY.notAnExpense}</p>}
      </div>

      <dl className={styles.details}>
        {account !== undefined && (
          <div>
            <dt>{candidate.kind === "withdrawal" ? CHAT_COPY.detailFrom : CHAT_COPY.detailAccount}</dt>
            <dd>{account}</dd>
          </div>
        )}
        {destination !== undefined && (
          <div>
            <dt>{CHAT_COPY.detailTo}</dt>
            <dd>{destination}</dd>
          </div>
        )}
        {candidate.occurredAtMs !== null && (
          <div>
            <dt>{CHAT_COPY.detailDate}</dt>
            <dd>{dhakaDateTime(candidate.occurredAtMs)}</dd>
          </div>
        )}
        {candidate.counterparty !== undefined && (
          <div>
            <dt>{CHAT_COPY.detailWhere}</dt>
            <dd>{candidate.counterparty}</dd>
          </div>
        )}
        {candidate.balanceAfterMinor !== undefined && (
          <div>
            <dt>{CHAT_COPY.detailBalanceAfter}</dt>
            <dd>{formatBdt(candidate.balanceAfterMinor)}</dd>
          </div>
        )}
      </dl>

      {askAccount && (
        <ChipQuestion
          legend={CHAT_COPY.whichAccount}
          options={anyAccount(accounts)}
          selectedId={accountId}
          onSelect={(id) => {
            setAccountId(id);
            if (otherAccountId === id) setOtherAccountId(null);
          }}
        />
      )}

      {unclassified && (
        <fieldset className={styles.choice}>
          <legend>{CHAT_COPY.whatIsThis}</legend>
          <div className={styles.chips}>
            <Chip
              selected={kindChoice === "known"}
              onClick={() => {
                setKindChoice("known");
              }}
            >
              {incoming ? CHAT_COPY.income : CHAT_COPY.spending}
            </Chip>
            <Chip
              selected={kindChoice === "transfer"}
              onClick={() => {
                setKindChoice("transfer");
              }}
            >
              {CHAT_COPY.transfer}
            </Chip>
            <Chip
              tentative
              selected={kindChoice === "other"}
              onClick={() => {
                setKindChoice("other");
              }}
            >
              {CHAT_COPY.somethingElse}
            </Chip>
          </div>
          {kindChoice === "other" && <p className={styles.note}>{CHAT_COPY.somethingElseHint}</p>}
        </fieldset>
      )}

      {asksOtherAccount && (
        <ChipQuestion
          legend={incoming ? CHAT_COPY.fromWhichAccount : CHAT_COPY.toWhichAccount}
          options={otherOptions}
          selectedId={otherAccountId}
          onSelect={setOtherAccountId}
        />
      )}

      {foreign && (
        <FormField label={CHAT_COPY.taka} hint={CHAT_COPY.takaHint}>
          {(control) => (
            <input
              {...control}
              inputMode="decimal"
              value={takaText}
              onChange={(e) => {
                setTakaText(e.target.value);
              }}
            />
          )}
        </FormField>
      )}

      {undated && (
        <FormField label={CHAT_COPY.date} hint={CHAT_COPY.dateHint}>
          {(control) => (
            <input
              {...control}
              type="date"
              max={pasteDate}
              value={dateText}
              onChange={(e) => {
                setDateText(e.target.value);
              }}
            />
          )}
        </FormField>
      )}

      {isLinkable &&
        (event.matchKind === "possibleCounterpart" ? (
          <>
            <p className={styles.note}>{CHAT_COPY.transferQuestion(amountText(candidate))}</p>
            <p className={styles.note}>{CHAT_COPY.transferNoHint}</p>
            <Button variant="text" disabled={busy} onClick={onLink}>
              {CHAT_COPY.yesTransfer}
            </Button>
          </>
        ) : (
          <>
            <p className={styles.note}>{CHAT_COPY.possibleMatch}</p>
            <Button variant="text" disabled={busy} onClick={onLink}>
              {CHAT_COPY.sameAsRecorded}
            </Button>
          </>
        ))}

      <p className={styles.note}>{CHAT_COPY.nothingSaved}</p>
      <div className={styles.actions}>
        {rejectButton}
        <Button
          disabled={busy || !complete}
          onClick={() => {
            onConfirm(overrides());
          }}
        >
          {CHAT_COPY.confirm}
        </Button>
      </div>
      {failure}
    </Card>
  );
}

function ChipQuestion({
  legend,
  options,
  selectedId,
  onSelect,
}: {
  legend: string;
  options: AccountRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <fieldset className={styles.choice}>
      <legend>{legend}</legend>
      <div className={styles.chips}>
        {options.map((option) => (
          <Chip
            key={option.id}
            selected={selectedId === option.id}
            onClick={() => {
              onSelect(option.id);
            }}
          >
            {option.name}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}
