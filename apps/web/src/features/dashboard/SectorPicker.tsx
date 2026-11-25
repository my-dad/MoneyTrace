"use client";

import { SECTOR_IDS, SECTOR_LABELS, type SectorId } from "@moneytrace/contracts";
import { useState, type CSSProperties } from "react";
import { DASHBOARD_COPY } from "../../shared/copy";
import type { CommandRequest, CommandResponse } from "../../shared/commands";
import { useAction } from "../../shared/use-action";
import { useModalFocus } from "../../shared/use-modal-focus";
import { ActionStatus } from "../shell/ActionStatus";
import styles from "./dashboard.module.css";

export type TagMerchant = (request: CommandRequest<"tagMerchant">) => Promise<CommandResponse<"tagMerchant">>;

const CHOICES = SECTOR_IDS.filter((id): id is Exclude<SectorId, "uncategorized"> => id !== "uncategorized");

/** Sorts one merchant into a sector. Reports only what the server confirmed. */
export function SectorPicker({
  merchantName,
  merchantKey,
  tagMerchant,
  onClose,
}: {
  merchantName: string;
  merchantKey: string;
  tagMerchant: TagMerchant;
  onClose: () => void;
}) {
  const focus = useModalFocus(onClose);
  const action = useAction();
  const [done, setDone] = useState<string | null>(null);

  const pick = (sector: Exclude<SectorId, "uncategorized">) =>
    void action.run(async () => {
      setDone(null);
      let total = 0;
      // The server sorts a batch per call; keep asking until it says nothing is left.
      for (;;) {
        const reply = await tagMerchant({ merchantKey, merchantName, sector });
        total += reply.resorted;
        if (!reply.more) break;
      }
      setDone(DASHBOARD_COPY.sorted(total, merchantName, SECTOR_LABELS[sector]));
    });

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={focus.ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sector-picker-title"
        tabIndex={-1}
        className={styles.sheet}
        onKeyDown={focus.onKeyDown}
        onClick={(event) => { event.stopPropagation(); }}
      >
        <h2 id="sector-picker-title" className={styles.sheetTitle}>{DASHBOARD_COPY.sortTitle(merchantName)}</h2>
        <p className={styles.sheetHint}>{DASHBOARD_COPY.sortHint}</p>
        <div className={styles.sectorGrid}>
          {CHOICES.map((id) => (
            <button key={id} type="button" className={styles.sectorChoice} disabled={action.busy} onClick={() => { pick(id); }} style={{ "--sector": `var(--mt-sector-${id})` } as CSSProperties}>
              {SECTOR_LABELS[id]}
            </button>
          ))}
        </div>
        {action.busy && <p role="status" className={styles.sheetHint}>{DASHBOARD_COPY.sorting}</p>}
        {done !== null && <p role="status" className={styles.sheetDone}>{done}</p>}
        <ActionStatus busy={action.busy} failed={action.failed} unavailable={action.unavailable} />
        <button type="button" className={styles.sheetClose} onClick={onClose}>{DASHBOARD_COPY.close}</button>
      </div>
    </div>
  );
}
