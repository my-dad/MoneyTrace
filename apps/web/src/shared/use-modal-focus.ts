import { useEffect, useRef, type KeyboardEvent } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behaviour for a modal dialog: focus moves in on open, Tab stays inside,
 * Escape closes, and focus returns to whatever opened it.
 */
export function useModalFocus(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog)?.focus();
    return () => { if (opener?.isConnected === true) opener.focus(); };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Escape also ends an IME composition (Bangla input); that must not close the dialog.
    if (event.key === "Escape" && !event.nativeEvent.isComposing) {
      event.stopPropagation();
      close.current();
      return;
    }
    if (event.key !== "Tab" || ref.current === null) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return { ref, onKeyDown, tabIndex: -1 };
}
