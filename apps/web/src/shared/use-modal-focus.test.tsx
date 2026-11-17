/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useModalFocus } from "./use-modal-focus";

afterEach(cleanup);

/** A dialog whose button is replaced by a result, as the cash count's Check is. */
function Dialog({ onClose }: { onClose: () => void }) {
  const focus = useModalFocus(onClose);
  const [done, setDone] = useState(false);
  return (
    <div role="dialog" aria-label="Test" {...focus}>
      {done ? <p>Result</p> : <button type="button" onClick={() => { setDone(true); }}>Check</button>}
    </div>
  );
}

it("keeps focus in the dialog when the focused control is replaced, so Escape still closes it", async () => {
  const onClose = vi.fn();
  render(<Dialog onClose={onClose} />);
  const check = screen.getByRole("button", { name: "Check" });
  expect(document.activeElement).toBe(check);
  fireEvent.click(check);
  const dialog = screen.getByRole("dialog", { name: "Test" });
  await waitFor(() => { expect(document.activeElement).toBe(dialog); });
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});
