/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sheet } from "./Sheet";

afterEach(cleanup);

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => { onClose(); setOpen(false); };
  return (
    <main>
      <button type="button" onClick={() => { setOpen(true); }}>Open</button>
      <button type="button">Behind</button>
      {open && (
        <Sheet title="Ask again…" onClose={close}>
          <button type="button">First</button>
          <button type="button">Last</button>
        </Sheet>
      )}
    </main>
  );
}

describe("Sheet", () => {
  it("moves focus in, traps Tab, closes on Escape and returns focus", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Ask again…" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    screen.getByRole("button", { name: "Last" }).focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Last" }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
