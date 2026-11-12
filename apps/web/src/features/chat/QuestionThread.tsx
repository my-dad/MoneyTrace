import { Button } from "@moneytrace/ui-kit";
import { useId, useState } from "react";
import type { Commands } from "../../shared/commands";
import { CHAT_COPY, COPY } from "../../shared/copy";
import type { SourceEventRow } from "../../shared/read-model-gateway";
import { useAction } from "../../shared/use-action";
import { ActionStatus } from "../shell/ActionStatus";
import styles from "./chat.module.css";

const SKIPPED = "(skipped)";

/** An answer refused because it looks like a secret (the server's sensitiveEvidence). */
const refusedAsSecret = (error: unknown): boolean => (error as { message?: unknown } | null)?.message === "sensitiveEvidence";

/**
 * DeepSeek's questions about a pasted message and the user's answers (CR-008). The latest
 * unanswered question offers its quick answers, a reply box and Skip.
 */
export function QuestionThread({ event, answerQuestion }: { event: SourceEventRow; answerQuestion: Commands["answerQuestion"] }) {
  const inputId = useId();
  const [text, setText] = useState("");
  const [secret, setSecret] = useState(false);
  const action = useAction();
  const open = event.status === "pending" && event.pendingReason === "aiQuestion";

  function send(request: { answer: string } | { skip: true }) {
    setSecret(false);
    void action.run(async () => {
      try {
        await answerQuestion({ sourceEventId: event.id, ...request });
        setText("");
      } catch (error) {
        if (refusedAsSecret(error)) setSecret(true);
        throw error;
      }
    });
  }

  return (
    <div className={styles.thread}>
      {event.clarifications.map((c, index) => {
        const latest = index === event.clarifications.length - 1 && c.answer === null && open;
        return (
          <div key={`${String(c.askedAtMs)}-${String(index)}`}>
            <div className={styles.askBubble}>
              <span className={styles.askLabel}>{CHAT_COPY.aiAsks(index + 1)}</span>
              <p>{c.question}</p>
              {latest && c.options.length > 0 && (
                <div className={styles.actions}>
                  {c.options.map((option) => (
                    <Button key={option} variant="secondary" disabled={action.busy} onClick={() => { send({ answer: option }); }}>{option}</Button>
                  ))}
                </div>
              )}
            </div>
            {c.answer !== null && <p className={styles.answerBubble}>{c.answer === SKIPPED ? CHAT_COPY.skipped : c.answer}</p>}
          </div>
        );
      })}
      {open && (
        <form
          className={styles.answerForm}
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() !== "") send({ answer: text.trim() });
          }}
        >
          <label htmlFor={inputId} className="mt-sr-only">{CHAT_COPY.yourAnswer}</label>
          <input id={inputId} value={text} maxLength={500} placeholder={CHAT_COPY.answerPlaceholder} onChange={(e) => { setText(e.target.value); }} />
          <Button type="submit" disabled={action.busy || text.trim() === ""} aria-label={CHAT_COPY.sendAnswer}>↑</Button>
          <Button type="button" variant="secondary" disabled={action.busy} onClick={() => { send({ skip: true }); }}>{CHAT_COPY.skip}</Button>
        </form>
      )}
      {secret ? <p role="alert" className={styles.error}>{COPY.otpRefused}</p> : <ActionStatus busy={action.busy} failed={action.failed} unavailable={action.unavailable} />}
    </div>
  );
}
