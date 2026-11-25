/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtureReadModels } from "../../shared/fixtures/fixture-read-models";
import { FIXTURE_NOW_MS } from "../../shared/fixtures/household";
import { ChatOpenerContext } from "../chat/ChatLauncher";
import { WelcomeBack } from "./WelcomeBack";

afterEach(cleanup);

const dhaka = (iso: string) => Date.parse(`${iso}+06:00`);

async function show(previousSeenAtMs: number | null, waiting = 4) {
  const openChat = vi.fn();
  const recordVisit = vi.fn(() => Promise.resolve({ previousSeenAtMs }));
  const view = render(
    <ChatOpenerContext.Provider value={{ openChat, waiting }}>
      <WelcomeBack gateway={createFixtureReadModels()} nowMs={FIXTURE_NOW_MS} name="Mabrur Chowdhury" recordVisit={recordVisit} />
    </ChatOpenerContext.Provider>,
  );
  await act(async () => { await Promise.resolve(); });
  return { openChat, recordVisit, view };
}

describe("WelcomeBack", () => {
  it("after days away, says how long and what happened since", async () => {
    await show(dhaka("2026-11-03T21:00:00"));
    const dialog = screen.getByRole("dialog", { name: "Welcome back, Mabrur" });
    expect(dialog.textContent).toContain("Last here 3 days ago");
    expect(dialog.textContent).toContain("৳7,070 spent and ৳0 came in since then");
    expect(dialog.textContent).toContain("4 things need your answer");
    expect(dialog.textContent).toContain("৳5,000 cash not yet explained");
    expect(dialog.textContent).toContain("Paste the bank SMS you got since Tue 3 Nov");
  });

  it("its buttons go where the work is", async () => {
    const { openChat } = await show(dhaka("2026-11-03T21:00:00"));
    fireEvent.click(screen.getByRole("button", { name: "Answer now" }));
    expect(openChat).toHaveBeenLastCalledWith();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Count my cash opens the count", async () => {
    const { openChat } = await show(dhaka("2026-11-03T21:00:00"));
    fireEvent.click(screen.getByRole("button", { name: "Count my cash" }));
    expect(openChat).toHaveBeenLastCalledWith("cashCount");
  });

  it("a day away leaves out the reminder to paste missed SMS and the questions when there are none", async () => {
    await show(dhaka("2026-11-05T22:00:00"), 0);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Last here yesterday");
    expect(dialog.textContent).not.toContain("Paste the bank SMS");
    expect(dialog.textContent).not.toContain("need your answer");
  });

  it("stays quiet on a second visit the same day, on the first visit, and if the visit couldn't be noted", async () => {
    await show(dhaka("2026-11-06T09:00:00"));
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    await show(null);
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    render(
      <ChatOpenerContext.Provider value={{ openChat: vi.fn(), waiting: 0 }}>
        <WelcomeBack gateway={createFixtureReadModels()} nowMs={FIXTURE_NOW_MS} name="M" recordVisit={() => Promise.reject(new Error("offline"))} />
      </ChatOpenerContext.Provider>,
    );
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("notes the visit once, and Got it closes", async () => {
    const { recordVisit, view } = await show(dhaka("2026-11-03T21:00:00"));
    view.rerender(
      <ChatOpenerContext.Provider value={{ openChat: vi.fn(), waiting: 4 }}>
        <WelcomeBack gateway={createFixtureReadModels()} nowMs={FIXTURE_NOW_MS} name="Mabrur Chowdhury" recordVisit={recordVisit} />
      </ChatOpenerContext.Provider>,
    );
    expect(recordVisit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
