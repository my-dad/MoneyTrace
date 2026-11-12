/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoUnavailableError } from "../../shared/demo-unavailable";
import { FIXTURE_ACCOUNTS, FIXTURE_SOURCE_EVENTS } from "../../shared/fixtures/household";
import type { SourceEventRow } from "../../shared/read-model-gateway";
import { EvidenceBubble } from "./EvidenceBubble";
import { QuestionThread } from "./QuestionThread";

afterEach(cleanup);

const base = FIXTURE_SOURCE_EVENTS.find((e) => e.id === "se-salary") as SourceEventRow;
const asked: SourceEventRow = {
  ...base,
  id: "se-nagad",
  status: "pending",
  pendingReason: "aiQuestion",
  clarifications: [
    { question: "Which account?", options: [], answer: "Nagad", askedAtMs: 1, answeredAtMs: 2 },
    { question: "Was this ৳2,000 paid from your Nagad, or received into it?", options: ["Paid from it", "Received"], answer: null, askedAtMs: 3, answeredAtMs: null },
  ],
};
const ok = () => vi.fn(() => Promise.resolve({ status: "received" as const }));

describe("QuestionThread (CR-008)", () => {
  it("shows the questions and answers so far", () => {
    render(<QuestionThread event={asked} answerQuestion={ok()} />);
    expect(screen.getByText("Which account?")).toBeTruthy();
    expect(screen.getByText("Nagad")).toBeTruthy();
    expect(screen.getByText("Was this ৳2,000 paid from your Nagad, or received into it?")).toBeTruthy();
  });

  it("a quick answer sends that option", async () => {
    const answerQuestion = ok();
    render(<QuestionThread event={asked} answerQuestion={answerQuestion} />);
    fireEvent.click(screen.getByRole("button", { name: "Paid from it" }));
    await waitFor(() => { expect(answerQuestion).toHaveBeenCalledWith({ sourceEventId: "se-nagad", answer: "Paid from it" }); });
  });

  it("a typed answer is sent, and Skip sends a skip", async () => {
    const answerQuestion = ok();
    render(<QuestionThread event={asked} answerQuestion={answerQuestion} />);
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "paid, for groceries" } });
    fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
    await waitFor(() => { expect(answerQuestion).toHaveBeenCalledWith({ sourceEventId: "se-nagad", answer: "paid, for groceries" }); });
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() => { expect(answerQuestion).toHaveBeenCalledWith({ sourceEventId: "se-nagad", skip: true }); });
  });

  it("an answer refused as a secret says so", async () => {
    render(<QuestionThread event={asked} answerQuestion={vi.fn(() => Promise.reject(Object.assign(new Error("sensitiveEvidence"), { code: "functions/failed-precondition" })))} />);
    fireEvent.click(screen.getByRole("button", { name: "Paid from it" }));
    expect((await screen.findByRole("alert")).textContent).toBe("This looks like a one-time code or secret. Nothing was saved.");
  });

  it("the demo says nothing was saved", async () => {
    render(<QuestionThread event={asked} answerQuestion={vi.fn(() => Promise.reject(new DemoUnavailableError()))} />);
    fireEvent.click(screen.getByRole("button", { name: "Received" }));
    expect((await screen.findByRole("status")).textContent).toBe("Not available yet — demo · nothing was saved");
  });

  it("an answered thread offers no reply box", () => {
    render(<QuestionThread event={{ ...asked, status: "interpreted", clarifications: asked.clarifications.slice(0, 1) }} answerQuestion={ok()} />);
    expect(screen.queryByLabelText("Your answer")).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = render(<QuestionThread event={asked} answerQuestion={ok()} />);
    expect((await axe.run(container)).violations).toEqual([]);
  });
});

describe("EvidenceBubble chips (CR-008)", () => {
  it("a recorded message shows its source chip, and a paired transfer both sources", () => {
    const commands = { confirmCandidate: vi.fn(), retrySourceEvent: vi.fn(), cancelSourceEvent: vi.fn(), answerQuestion: ok() };
    const transfer = FIXTURE_SOURCE_EVENTS.find((e) => e.id === "se-transfer-bkash") as SourceEventRow;
    render(<EvidenceBubble item={{ kind: "evidence", id: transfer.id, text: transfer.retainedText, outcome: "recorded", statusCopy: "Recorded", event: transfer }} accounts={FIXTURE_ACCOUNTS} commands={commands} />);
    expect(screen.getByText("Transfer")).toBeTruthy();
    expect(screen.getByText("DBBL Savings")).toBeTruthy();
    expect(screen.getByText("bKash")).toBeTruthy();
  });
});
