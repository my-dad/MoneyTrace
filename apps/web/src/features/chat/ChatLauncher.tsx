"use client";

import { useEffect, useState } from "react";
import { CHAT_COPY } from "../../shared/copy";
import type { FollowUpRow, ReadModelGateway } from "../../shared/read-model-gateway";
import { useModalFocus } from "../../shared/use-modal-focus";
import { isAwaitingAnswer } from "./chat-view-model";
import { ChatScreen, type ChatCommands } from "./ChatScreen";
import styles from "./launcher.module.css";

/** Questions waiting for an answer: open ones, and snoozed ones whose snooze has passed. */
export function openQuestionCount(rows: FollowUpRow[], nowMs: number): number {
  return rows.filter((row) => isAwaitingAnswer(row, nowMs)).length;
}

const buttonLabel = (count: number): string =>
  count === 0 ? "Open chat" : `Open chat, ${String(count)} ${count === 1 ? "question" : "questions"} waiting`;

/** The round chat button and its panel: full screen on phones, a right-hand panel on desktop. */
export function ChatLauncher({ gateway, commands, nowMs }: { gateway: ReadModelGateway; commands: ChatCommands; nowMs: number }) {
  const [open, setOpen] = useState(false);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  useEffect(() => gateway.watchFollowUps(setFollowUps), [gateway]);
  const count = openQuestionCount(followUps, nowMs);

  return (
    <>
      <button type="button" className={styles.fab} aria-label={buttonLabel(count)} onClick={() => { setOpen(true); }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        </svg>
        {count > 0 && <span className={styles.badge} aria-hidden="true">{count}</span>}
      </button>
      {open && <ChatPanel gateway={gateway} commands={commands} nowMs={nowMs} onClose={() => { setOpen(false); }} />}
    </>
  );
}

function ChatPanel({ gateway, commands, nowMs, onClose }: { gateway: ReadModelGateway; commands: ChatCommands; nowMs: number; onClose: () => void }) {
  const focus = useModalFocus(onClose);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="chat-panel-title" className={styles.panel} {...focus}>
      <div className={styles.head}>
        <span className={styles.mark} aria-hidden="true">M</span>
        <div className={styles.title}>
          <h2 id="chat-panel-title">Chat</h2>
          <span>{CHAT_COPY.subtitle}</span>
        </div>
        <button type="button" className={styles.close} aria-label="Close chat" onClick={onClose}>✕</button>
      </div>
      <ChatScreen gateway={gateway} commands={commands} nowMs={nowMs} embedded />
    </div>
  );
}
