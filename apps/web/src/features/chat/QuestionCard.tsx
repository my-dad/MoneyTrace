import { Chip } from "@moneytrace/ui-kit";
import { useState } from "react";
import type { Commands } from "../../shared/commands";
import type { AccountRow, FollowUpRow } from "../../shared/read-model-gateway";
import { cashPlaces } from "./chat-accounts";
import { CHAT_COPY } from "./chat-copy";
import styles from "./chat.module.css";
import { useAction } from "./use-action";

export function QuestionCard({
  followUp,
  accounts,
  resolveFollowUp,
}: {
  followUp: FollowUpRow;
  accounts: AccountRow[];
  resolveFollowUp: Commands["resolveFollowUp"];
}) {
  const { busy, failed, run } = useAction();
  const [askingLater, setAskingLater] = useState(false);
  // Only a follow-up with a transaction behind it has cash the server can place.
  const places = followUp.targetTransactionId === undefined ? [] : cashPlaces(accounts);

  function answer(accountId: string) {
    setAskingLater(false);
    void run(() =>
      resolveFollowUp({ followUpId: followUp.id, resolution: { kind: "destination", accountId } }),
    );
  }

  function notSure() {
    void run(async () => {
      const { state } = await resolveFollowUp({
        followUpId: followUp.id,
        resolution: { kind: "notSureYet" },
      });
      setAskingLater(state === "open");
    });
  }

  return (
    <fieldset className={styles.question} disabled={busy}>
      <legend className={styles.questionTitle}>{followUp.question}</legend>
      <div className={styles.chips}>
        {places.map((place) => (
          <Chip
            key={place.id}
            onClick={() => {
              answer(place.id);
            }}
          >
            {place.name}
          </Chip>
        ))}
        <Chip tentative onClick={notSure}>
          {CHAT_COPY.notSureYet}
        </Chip>
      </div>
      {places.length === 0 && <p className={styles.note}>{CHAT_COPY.noCashPlaces}</p>}
      <p className={styles.note}>{CHAT_COPY.questionHint}</p>
      {askingLater && <p role="status" className={styles.note}>{CHAT_COPY.askAgain}</p>}
      {failed && <p role="alert" className={styles.error}>{CHAT_COPY.answerFailed}</p>}
    </fieldset>
  );
}
