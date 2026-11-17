"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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

/** False without matchMedia (tests) or when the device asks for less motion: then the chat closes at once. */
const motionAllowed = (): boolean =>
  typeof window.matchMedia === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Longest the slide-out may take before the panel is removed anyway (its animation is 200 ms). */
const CLOSE_FALLBACK_MS = 400;

const buttonLabel = (count: number): string =>
  count === 0 ? "Open chat" : `Open chat, ${String(count)} ${count === 1 ? "question" : "questions"} waiting`;

/** Where the chat opens: on the cash count, or with the message box ready for a pasted SMS. */
export type ChatStart = "cashCount" | "paste";

export type ChatOpener = {
  openChat: (start?: ChatStart) => void;
  /** Questions waiting for an answer, the same number as the chat button's badge. */
  waiting: number;
};

/** Lets the page open the chat, for example straight on the cash count. */
export const ChatOpenerContext = createContext<ChatOpener | null>(null);

/** Null outside a launcher, so a page can hide controls that would open nothing. */
export const useChatOpener = (): ChatOpener | null => useContext(ChatOpenerContext);

/** The round chat button and its panel: full screen on phones, a right-hand panel on desktop. */
export function ChatLauncher({
  gateway,
  commands,
  nowMs,
  children,
}: {
  gateway: ReadModelGateway;
  commands: ChatCommands;
  nowMs: number;
  /** The page, which may open the chat through `useChatOpener`. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState<false | { start?: ChatStart }>(false);
  // The panel stays mounted while it slides out, then goes.
  const [closing, setClosing] = useState(false);
  const finishClosing = useCallback(() => {
    setClosing(false);
    setOpen(false);
  }, []);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  useEffect(() => gateway.watchFollowUps(setFollowUps), [gateway]);
  const count = openQuestionCount(followUps, nowMs);
  const opener = useMemo<ChatOpener>(
    () => ({
      openChat: (start) => {
        setClosing(false);
        setOpen(start === undefined ? {} : { start });
      },
      waiting: count,
    }),
    [count],
  );

  return (
    <ChatOpenerContext.Provider value={opener}>
      {children}
      <button type="button" className={styles.fab} aria-label={buttonLabel(count)} onClick={() => { opener.openChat(); }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        </svg>
        {/* Keyed by the count, so a new question makes the badge pop again. */}
        {count > 0 && <span key={count} className={styles.badge} aria-hidden="true">{count}</span>}
      </button>
      {open !== false && (
        <ChatPanel
          gateway={gateway}
          commands={commands}
          nowMs={nowMs}
          {...(open.start === undefined ? {} : { startWith: open.start })}
          closing={closing}
          onClose={() => {
            if (motionAllowed()) setClosing(true);
            else setOpen(false);
          }}
          onClosed={finishClosing}
        />
      )}
    </ChatOpenerContext.Provider>
  );
}

function ChatPanel({
  gateway,
  commands,
  nowMs,
  startWith,
  closing,
  onClose,
  onClosed,
}: {
  gateway: ReadModelGateway;
  commands: ChatCommands;
  nowMs: number;
  startWith?: ChatStart;
  closing: boolean;
  onClose: () => void;
  onClosed: () => void;
}) {
  const focus = useModalFocus(onClose);
  useEffect(() => {
    const dialog = focus.ref.current;
    if (!closing || dialog === null) return undefined;
    // The panel's own slide-out, not an animation inside it.
    const ended = (event: Event) => { if (event.target === dialog) onClosed(); };
    dialog.addEventListener("animationend", ended);
    const timer = setTimeout(onClosed, CLOSE_FALLBACK_MS);
    return () => {
      dialog.removeEventListener("animationend", ended);
      clearTimeout(timer);
    };
  }, [closing, onClosed, focus.ref]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-panel-title"
      className={`${styles.panel ?? ""} ${closing ? (styles.closing ?? "") : ""}`}
      {...focus}
    >
      <div className={styles.head}>
        <span className={styles.mark} aria-hidden="true">M</span>
        <div className={styles.title}>
          <h2 id="chat-panel-title">Chat</h2>
          <span>{CHAT_COPY.subtitle}</span>
        </div>
        <button type="button" className={styles.close} aria-label="Close chat" onClick={onClose}>✕</button>
      </div>
      <ChatScreen
        gateway={gateway}
        commands={commands}
        nowMs={nowMs}
        embedded
        {...(startWith === undefined ? {} : { startWith })}
      />
    </div>
  );
}
