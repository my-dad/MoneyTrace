/** @vitest-environment jsdom */

import { MAX_EVIDENCE_TEXT_CHARS } from "@moneytrace/contracts";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COPY } from "../../shared/copy";
import { DemoUnavailableError } from "../../shared/demo-unavailable";
import { InMemoryReadModelGateway } from "../../shared/in-memory-read-model-gateway";
import type { AccountRow, FollowUpRow, ReadModelGateway, SourceEventRow } from "../../shared/read-model-gateway";
import { ChatScreen, type ChatCommands } from "./ChatScreen";

afterEach(cleanup);

const RECEIVED_AT = Date.parse("2026-11-06T12:45:00Z");

const account = (id: string, kind: AccountRow["kind"], name: string, status: AccountRow["status"] = "active"): AccountRow => ({
  id,
  kind,
  name,
  currency: "BDT",
  status,
  createdAtMs: 1,
});

const ACCOUNTS: AccountRow[] = [
  account("cash-unassigned", "cash", "Cash · place not set"),
  account("bank-1", "bank", "City Bank"),
  account("bank-2", "bank", "BRAC Bank"),
  account("card-1", "creditLiability", "Amex"),
  account("wallet-1", "cash", "My wallet"),
  account("ammu", "familyCash", "Ammu"),
  account("old-wallet", "cash", "Old wallet", "closed"),
];

type Candidate = NonNullable<SourceEventRow["candidate"]>;

const candidate = (extra: Partial<Candidate> = {}): Candidate => ({
  kind: "purchase",
  amountMinor: 250000,
  currency: "BDT",
  occurredAtMs: RECEIVED_AT,
  ...extra,
});

const event = (extra: Partial<SourceEventRow> = {}): SourceEventRow => ({
  id: "event-1",
  sourceType: "sms",
  sourceHash: "hash",
  idempotencyKey: "key-1",
  status: "received",
  stageAttempt: 0,
  claim: null,
  parkedStage: null,
  version: 1,
  receivedAtMs: RECEIVED_AT,
  terminalAtMs: null,
  providerResultsPurged: false,
  retainedText: "Tk 2,500.00 debited from A/C **4821",
  candidate: null,
  extraction: null,
  matchedTransactionId: null,
  matchKind: null,
  resolvedAccountId: null,
  resolvedDestinationAccountId: null,
  userConfirmed: false,
  ...extra,
});

const awaiting = (extra: Partial<SourceEventRow> = {}) =>
  event({
    status: "pending",
    pendingReason: "awaitingClarification",
    candidate: candidate(),
    resolvedAccountId: "bank-1",
    ...extra,
  });

const followUp = (extra: Partial<FollowUpRow> = {}): FollowUpRow => ({
  id: "follow-1",
  trigger: "withdrawalDestination",
  targetTransactionId: "txn-1",
  question: "You withdrew ৳5,000 from an ATM. Where did the cash go?",
  dueAtMs: RECEIVED_AT,
  snoozedUntilMs: null,
  state: "open",
  createdAtMs: RECEIVED_AT + 1,
  resolvedAtMs: null,
  ...extra,
});

function fakeCommands() {
  return {
    submitEvidence: vi.fn<ChatCommands["submitEvidence"]>(() =>
      Promise.resolve({ sourceEventId: "event-1", status: "received", duplicate: false }),
    ),
    confirmCandidate: vi.fn<ChatCommands["confirmCandidate"]>(() => Promise.resolve({ status: "pending" })),
    resolveFollowUp: vi.fn<ChatCommands["resolveFollowUp"]>(() => Promise.resolve({ state: "resolved" })),
    retrySourceEvent: vi.fn<ChatCommands["retrySourceEvent"]>(() => Promise.resolve({ status: "received" })),
    cancelSourceEvent: vi.fn<ChatCommands["cancelSourceEvent"]>(() => Promise.resolve({ status: "cancelled" })),
  };
}

function setup(state: { events?: SourceEventRow[]; followUps?: FollowUpRow[]; accounts?: AccountRow[] } = {}) {
  const gateway = new InMemoryReadModelGateway();
  gateway.setAccounts(state.accounts ?? ACCOUNTS);
  gateway.setSourceEvents(state.events ?? []);
  gateway.setFollowUps(state.followUps ?? []);
  const commands = fakeCommands();
  const view = render(<ChatScreen gateway={gateway} commands={commands} />);
  return { gateway, commands, ...view };
}

const composer = () => screen.getByLabelText<HTMLTextAreaElement>("Message MoneyTrace");
const button = (name: string | RegExp) => screen.getByRole<HTMLButtonElement>("button", { name });
const log = () => screen.getByRole("log", { name: "Conversation" });

function send(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
  fireEvent.keyDown(composer(), { key: "Enter" });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("sending", () => {
  it("shows received at once, then real status, and never Recorded before the event is posted", async () => {
    const { gateway, commands } = setup();
    const pending = deferred<Awaited<ReturnType<ChatCommands["submitEvidence"]>>>();
    commands.submitEvidence.mockReturnValueOnce(pending.promise);

    send("Tk 2,500.00 debited");
    expect(within(log()).getByRole("status").textContent).toContain("Sending");
    expect(log().textContent).not.toContain("Recorded");

    await act(async () => {
      pending.resolve({ sourceEventId: "event-1", status: "received", duplicate: false });
      await pending.promise;
    });
    expect(log().textContent).toContain("Reading");
    expect(log().textContent).not.toContain("Recorded");

    act(() => {
      gateway.setSourceEvents([event()]);
    });
    expect(log().textContent).toContain("Reading");
    expect(log().textContent).not.toContain("Recorded");

    act(() => {
      gateway.setSourceEvents([awaiting()]);
    });
    expect(log().textContent).toContain("Waiting for your answer");
    expect(log().textContent).not.toContain("Recorded");

    act(() => {
      gateway.setSourceEvents([event({ status: "posted", candidate: candidate() })]);
    });
    expect(log().textContent).toContain("Recorded");
    expect(log().textContent).not.toContain("Waiting for your answer");
  });

  it("the composer clears only after the server accepted the text", async () => {
    const { commands } = setup();
    const pending = deferred<Awaited<ReturnType<ChatCommands["submitEvidence"]>>>();
    commands.submitEvidence.mockReturnValueOnce(pending.promise);

    send("Tk 500 paid");
    expect(composer().value).toBe("Tk 500 paid");
    expect(button("Send").disabled).toBe(true);

    await act(async () => {
      pending.resolve({ sourceEventId: "event-1", status: "received", duplicate: false });
      await pending.promise;
    });
    expect(composer().value).toBe("");
  });

  it("a retry after a network error reuses the same idempotency key", async () => {
    const { commands } = setup();
    commands.submitEvidence.mockRejectedValueOnce({ code: "functions/unavailable", message: "unavailable" });

    send("Tk 500 paid");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("couldn't confirm");
    expect(composer().value).toBe("Tk 500 paid");

    fireEvent.keyDown(composer(), { key: "Enter" });
    await waitFor(() => {
      expect(commands.submitEvidence).toHaveBeenCalledTimes(2);
    });
    const [first, second] = commands.submitEvidence.mock.calls.map(([request]) => request);
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey);
    expect(second?.text).toBe("Tk 500 paid");
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  it("edited text after a network error gets a new idempotency key", async () => {
    const { commands } = setup();
    commands.submitEvidence.mockRejectedValueOnce({ code: "functions/unavailable", message: "unavailable" });

    send("Tk 500 paid");
    await screen.findByRole("alert");
    send("Tk 600 paid");
    await waitFor(() => {
      expect(commands.submitEvidence).toHaveBeenCalledTimes(2);
    });
    const [first, second] = commands.submitEvidence.mock.calls.map(([request]) => request);
    expect(second?.idempotencyKey).not.toBe(first?.idempotencyKey);
  });

  it("two accepted messages use different idempotency keys", async () => {
    const { commands } = setup();
    send("Tk 500 paid");
    await waitFor(() => {
      expect(composer().value).toBe("");
    });
    send("Tk 500 paid");
    await waitFor(() => {
      expect(commands.submitEvidence).toHaveBeenCalledTimes(2);
    });
    const [first, second] = commands.submitEvidence.mock.calls.map(([request]) => request);
    expect(second?.idempotencyKey).not.toBe(first?.idempotencyKey);
  });

  it("an OTP refusal keeps the text out of the timeline and explains why", async () => {
    const { commands } = setup();
    commands.submitEvidence.mockRejectedValueOnce({ code: "functions/failed-precondition", message: "sensitiveEvidence" });

    send("Your OTP is 493021");
    expect(log().textContent).not.toContain("493021");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(COPY.otpRefused);
    expect(log().textContent).not.toContain("493021");
  });

  it("a definite refusal says nothing was saved", async () => {
    const { commands } = setup();
    commands.submitEvidence.mockRejectedValueOnce({ code: "functions/failed-precondition", message: "invalidIntent" });
    send("Tk 500 paid");
    expect((await screen.findByRole("alert")).textContent).toContain("Nothing was saved");
  });

  it("over-long text says so, without calling the server", async () => {
    const { commands } = setup();
    send("x".repeat(MAX_EVIDENCE_TEXT_CHARS + 1));
    expect((await screen.findByRole("alert")).textContent).toContain("too long");
    expect(commands.submitEvidence).not.toHaveBeenCalled();
  });

  it("evidence shows the server's masked text, not what was typed", async () => {
    const { gateway } = setup();
    send("Tk 500 from A/C 1234567894821");
    await waitFor(() => {
      expect(composer().value).toBe("");
    });
    act(() => {
      gateway.setSourceEvents([event({ retainedText: "Tk 500 from A/C **4821" })]);
    });
    expect(log().textContent).toContain("Tk 500 from A/C **4821");
    expect(log().textContent).not.toContain("1234567894821");
  });

  it("a repeat of a message already received says so", async () => {
    const { commands } = setup();
    commands.submitEvidence.mockResolvedValueOnce({ sourceEventId: "event-1", status: "posted", duplicate: true });
    send("Tk 500 paid");
    expect(await screen.findByText(/already received/)).toBeTruthy();
  });
});

describe("reads", () => {
  it("a listener failure says so instead of showing stale state as current", () => {
    const memory = new InMemoryReadModelGateway();
    const gateway: ReadModelGateway = {
      watchAccounts: (onValue) => memory.watchAccounts(onValue),
      watchBalances: (onValue) => memory.watchBalances(onValue),
      watchFollowUps: (onValue) => memory.watchFollowUps(onValue),
      watchExpenseEntries: () => () => undefined,
      watchSourceEvents: (_limit, _onValue, onError) => {
        onError?.(new Error("denied"));
        return () => undefined;
      },
    };
    render(<ChatScreen gateway={gateway} commands={fakeCommands()} />);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load");
  });

  it("stops listening when it leaves the screen", () => {
    const memory = new InMemoryReadModelGateway();
    const unsubscribe = vi.fn();
    const gateway: ReadModelGateway = {
      watchAccounts: (onValue) => memory.watchAccounts(onValue),
      watchBalances: (onValue) => memory.watchBalances(onValue),
      watchFollowUps: (onValue) => memory.watchFollowUps(onValue),
      watchExpenseEntries: () => () => undefined,
      watchSourceEvents: () => unsubscribe,
    };
    const { unmount } = render(<ChatScreen gateway={gateway} commands={fakeCommands()} />);
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("offers no upload action", () => {
    setup();
    expect(screen.queryByRole("button", { name: /attach|upload|receipt/i })).toBeNull();
  });
});

describe("transaction preview", () => {
  it("shows Not saved yet, Nothing is saved until you confirm, Confirm and Reject while waiting", () => {
    setup({ events: [awaiting()] });
    expect(log().textContent).toContain("Not saved yet");
    expect(log().textContent).toContain("Nothing is saved until you confirm");
    expect(log().textContent).toContain("৳2,500");
    expect(log().textContent).toContain("City Bank");
    expect(button("Confirm").disabled).toBe(false);
    expect(button("Reject").disabled).toBe(false);
  });

  it("a posted event has no preview wording", () => {
    setup({ events: [event({ status: "posted", candidate: candidate() })] });
    expect(log().textContent).not.toContain("Nothing is saved until you confirm");
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("a withdrawal or transfer preview says it isn't an expense; a purchase doesn't", () => {
    const { gateway } = setup({ events: [awaiting({ candidate: candidate({ kind: "withdrawal" }) })] });
    expect(log().textContent).toContain(COPY.notAnExpense);
    act(() => {
      gateway.setSourceEvents([awaiting()]);
    });
    expect(log().textContent).not.toContain(COPY.notAnExpense);
  });

  it("Confirm sends no overrides when nothing was asked, and doesn't claim Recorded", async () => {
    const { commands } = setup({ events: [awaiting()] });
    fireEvent.click(button("Confirm"));
    await waitFor(() => {
      expect(commands.confirmCandidate).toHaveBeenCalledWith({ sourceEventId: "event-1", decision: "confirm" });
    });
    expect(log().textContent).not.toContain("Recorded");
  });

  it("Reject rejects", async () => {
    const { commands } = setup({ events: [awaiting()] });
    fireEvent.click(button("Reject"));
    await waitFor(() => {
      expect(commands.confirmCandidate).toHaveBeenCalledWith({ sourceEventId: "event-1", decision: "reject" });
    });
  });

  it("a failed Confirm says it failed", async () => {
    const { commands } = setup({ events: [awaiting()] });
    commands.confirmCandidate.mockRejectedValueOnce({ code: "functions/internal", message: "internal" });
    fireEvent.click(button("Confirm"));
    expect((await screen.findByRole("alert")).textContent).toContain("Your answer wasn't saved");
    expect(button("Confirm").disabled).toBe(false);
  });

  it("an unclassified credit can't be confirmed until the user says what it is", async () => {
    const { commands } = setup({ events: [awaiting({ candidate: candidate({ kind: "unclassifiedCredit" }) })] });
    expect(button("Confirm").disabled).toBe(true);
    fireEvent.click(button("Income"));
    fireEvent.click(button("Confirm"));
    await waitFor(() => {
      expect(commands.confirmCandidate).toHaveBeenCalledWith({
        sourceEventId: "event-1",
        decision: "confirm",
        overrides: { kind: "income" },
      });
    });
  });

  it("an incoming transfer leaves the other account and lands in the SMS's account", async () => {
    const { commands } = setup({ events: [awaiting({ candidate: candidate({ kind: "unclassifiedCredit" }) })] });
    fireEvent.click(button("Transfer between my accounts"));
    expect(button("Confirm").disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "City Bank" })).toBeNull();
    fireEvent.click(button("BRAC Bank"));
    fireEvent.click(button("Confirm"));
    await waitFor(() => {
      expect(commands.confirmCandidate).toHaveBeenCalledWith({
        sourceEventId: "event-1",
        decision: "confirm",
        overrides: { kind: "transfer", accountId: "bank-2", destinationAccountId: "bank-1" },
      });
    });
  });

  it("an outgoing transfer leaves the SMS's account and lands in the other", async () => {
    const { commands } = setup({ events: [awaiting({ candidate: candidate({ kind: "unclassifiedDebit" }) })] });
    fireEvent.click(button("Transfer between my accounts"));
    fireEvent.click(button("BRAC Bank"));
    fireEvent.click(button("Confirm"));
    await waitFor(() => {
      expect(commands.confirmCandidate).toHaveBeenCalledWith({
        sourceEventId: "event-1",
        decision: "confirm",
        overrides: { kind: "transfer", destinationAccountId: "bank-2" },
      });
    });
  });

  it("an unclassified debit can be called spending", async () => {
    const { commands } = setup({ events: [awaiting({ candidate: candidate({ kind: "unclassifiedDebit" }) })] });
    fireEvent.click(button("Spending"));
    fireEvent.click(button("Confirm"));
    await waitFor(() => {
      expect(commands.confirmCandidate).toHaveBeenCalledWith({
        sourceEventId: "event-1",
        decision: "confirm",
        overrides: { kind: "purchase" },
      });
    });
  });

  it("Something else can only be rejected, so no kind is invented", () => {
    setup({ events: [awaiting({ candidate: candidate({ kind: "unclassifiedCredit" }) })] });
    fireEvent.click(button("Something else"));
    expect(button("Confirm").disabled).toBe(true);
    expect(button("Reject").disabled).toBe(false);
  });

  it("a foreign-currency SMS shows the original and needs a BDT amount before Confirm", async () => {
    const { commands } = setup({
      events: [awaiting({ candidate: candidate({ currency: "USD", amountMinor: 1250, kind: "cardPurchase" }) })],
    });
    expect(log().textContent).toContain("USD 12.50");
    expect(button("Confirm").disabled).toBe(true);
    const amount = screen.getByLabelText(/amount in taka/i);
    fireEvent.change(amount, { target: { value: "12.345" } });
    expect(button("Confirm").disabled).toBe(true);
    fireEvent.change(amount, { target: { value: "1,850.50" } });
    fireEvent.click(button("Confirm"));
    await waitFor(() => {
      expect(commands.confirmCandidate).toHaveBeenCalledWith({
        sourceEventId: "event-1",
        decision: "confirm",
        overrides: { amountMinor: 185050, currency: "BDT" },
      });
    });
  });

  it("an SMS with no date defaults to the paste time", async () => {
    const { commands } = setup({ events: [awaiting({ candidate: candidate({ occurredAtMs: null }) })] });
    expect(screen.getByLabelText<HTMLInputElement>(/date/i).value).toBe("2026-11-06");
    fireEvent.click(button("Confirm"));
    await waitFor(() => {
      expect(commands.confirmCandidate).toHaveBeenCalledWith({
        sourceEventId: "event-1",
        decision: "confirm",
        overrides: { occurredAtMs: RECEIVED_AT },
      });
    });
  });

  it("a changed date means the start of that date in Dhaka, not UTC", async () => {
    const { commands } = setup({ events: [awaiting({ candidate: candidate({ occurredAtMs: null }) })] });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-11-02" } });
    fireEvent.click(button("Confirm"));
    await waitFor(() => {
      expect(commands.confirmCandidate).toHaveBeenCalledWith({
        sourceEventId: "event-1",
        decision: "confirm",
        overrides: { occurredAtMs: Date.parse("2026-11-01T18:00:00Z") },
      });
    });
  });

  it("an unknown card ending asks which account, never guessing, and hides unusable accounts", async () => {
    const { commands } = setup({ events: [awaiting({ resolvedAccountId: null })] });
    expect(button("Confirm").disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Old wallet" })).toBeNull();
    expect(screen.queryByRole("button", { name: /place not set/ })).toBeNull();
    fireEvent.click(button("Amex"));
    fireEvent.click(button("Confirm"));
    await waitFor(() => {
      expect(commands.confirmCandidate).toHaveBeenCalledWith({
        sourceEventId: "event-1",
        decision: "confirm",
        overrides: { accountId: "card-1" },
      });
    });
  });

  it("a possible match can be linked to what's already recorded", async () => {
    const { commands } = setup({ events: [awaiting({ matchKind: "possibleCounterpart", matchedTransactionId: "txn-9" })] });
    fireEvent.click(button(/same as one already recorded/i));
    await waitFor(() => {
      expect(commands.confirmCandidate).toHaveBeenCalledWith({ sourceEventId: "event-1", decision: "link" });
    });
  });

  it("evidence nothing could be read from offers no Confirm", () => {
    setup({ events: [awaiting({ candidate: null, resolvedAccountId: null })] });
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(log().textContent).toContain("couldn't read");
    expect(button("Reject").disabled).toBe(false);
  });
});

describe("question card", () => {
  it("question chips list the user's cash wallets, family holders, and Not sure yet", () => {
    setup({ followUps: [followUp()] });
    const group = screen.getByRole("group", { name: followUp().question });
    const labels = within(group)
      .getAllByRole("button")
      .map((chip) => chip.textContent);
    expect(labels).toEqual(["My wallet", "Ammu", "Not sure yet"]);
  });

  it("the wording never implies the cash was spent", () => {
    setup({ followUps: [followUp()] });
    expect(log().textContent).toContain("won't count as spending");
    expect(log().textContent).not.toMatch(/missing|lost|unaccounted/i);
  });

  it("answering sends the chosen account", async () => {
    const { commands } = setup({ followUps: [followUp()] });
    fireEvent.click(button("Ammu"));
    await waitFor(() => {
      expect(commands.resolveFollowUp).toHaveBeenCalledWith({
        followUpId: "follow-1",
        resolution: { kind: "destination", accountId: "ammu" },
      });
    });
  });

  it("Not sure yet is honest that it will ask again", async () => {
    const { commands } = setup({ followUps: [followUp()] });
    commands.resolveFollowUp.mockResolvedValueOnce({ state: "open" });
    fireEvent.click(button("Not sure yet"));
    await waitFor(() => {
      expect(commands.resolveFollowUp).toHaveBeenCalledWith({
        followUpId: "follow-1",
        resolution: { kind: "notSureYet" },
      });
    });
    expect((await screen.findByText(/ask again/i)).textContent).toBeTruthy();
  });

  it("a failed answer says it wasn't saved", async () => {
    const { commands } = setup({ followUps: [followUp()] });
    commands.resolveFollowUp.mockRejectedValueOnce({ code: "functions/internal", message: "internal" });
    fireEvent.click(button("My wallet"));
    expect((await screen.findByRole("alert")).textContent).toContain("Your answer wasn't saved");
  });

  it("with nowhere to put the cash, it says what to do", () => {
    setup({ followUps: [followUp()], accounts: [account("bank-1", "bank", "City Bank")] });
    expect(log().textContent).toContain("Add a wallet");
    expect(button("Not sure yet").disabled).toBe(false);
  });
});

describe("retry", () => {
  const unknown = () =>
    event({ status: "pending", pendingReason: "providerOutcomeUnknown", parkedStage: "interpret" });

  it("an unknown-outcome event offers Retry, warning that a second charge is possible", async () => {
    const { commands } = setup({ events: [unknown()] });
    expect(log().textContent).toMatch(/charge.*second time|second charge/i);
    fireEvent.click(button("Retry"));
    await waitFor(() => {
      expect(commands.retrySourceEvent).toHaveBeenCalledWith({ sourceEventId: "event-1" });
    });
  });

  it("an unknown-outcome event can be cancelled instead", async () => {
    const { commands } = setup({ events: [unknown()] });
    fireEvent.click(button("Cancel"));
    await waitFor(() => {
      expect(commands.cancelSourceEvent).toHaveBeenCalledWith({ sourceEventId: "event-1" });
    });
  });

  it("a quota wait offers Retry with no charge warning", () => {
    setup({ events: [event({ status: "pending", pendingReason: "aiQuotaExhausted" })] });
    expect(button("Retry").disabled).toBe(false);
    expect(log().textContent).not.toMatch(/second/i);
  });

  it("a failed Retry says it failed", async () => {
    const { commands } = setup({ events: [unknown()] });
    commands.retrySourceEvent.mockRejectedValueOnce({ code: "functions/internal", message: "internal" });
    fireEvent.click(button("Retry"));
    expect((await screen.findByRole("alert")).textContent).toContain("didn't work");
  });

  it("a dead-lettered event offers no Retry that the server would refuse", () => {
    setup({ events: [event({ status: "deadLetter", deadLetterReason: "stageFailed" })] });
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});

describe("keyboard", () => {
  it("keyboard: tab to composer, type, Enter sends; chips are reachable", async () => {
    const { commands } = setup({ followUps: [followUp()] });
    composer().focus();
    expect(document.activeElement).toBe(composer());
    send("Tk 500 paid");
    await waitFor(() => {
      expect(commands.submitEvidence).toHaveBeenCalledOnce();
    });
    for (const name of ["My wallet", "Ammu", "Not sure yet"]) {
      const chip = button(name);
      expect(chip.tagName).toBe("BUTTON");
      expect(chip.tabIndex).toBe(0);
      expect(chip.disabled).toBe(false);
    }
  });
});

describe("axe", () => {
  const states: [string, Parameters<typeof setup>[0]][] = [
    ["empty", {}],
    ["reading", { events: [event()] }],
    ["preview", { events: [awaiting()] }],
    ["unclassified preview", { events: [awaiting({ candidate: candidate({ kind: "unclassifiedCredit" }) })] }],
    ["foreign, undated, no account", { events: [awaiting({ resolvedAccountId: null, candidate: candidate({ currency: "USD", occurredAtMs: null }) })] }],
    ["question", { events: [event({ status: "posted", candidate: candidate() })], followUps: [followUp()] }],
    ["unknown outcome", { events: [event({ status: "pending", pendingReason: "providerOutcomeUnknown" })] }],
    ["failed", { events: [event({ status: "deadLetter", deadLetterReason: "stageFailed" })] }],
  ];

  it.each(states)("has no axe violations when %s", async (_name, state) => {
    const { container } = setup(state);
    // Contrast needs real layout, which jsdom lacks; ui-kit's token test covers the palette.
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  it("says a demo send was not saved instead of asking to send again", async () => {
    const { commands } = setup();
    commands.submitEvidence.mockImplementation(() => Promise.reject(new DemoUnavailableError()));
    send("Tk 500 paid");
    expect((await screen.findByRole("alert")).textContent).toBe(COPY.demoUnavailable);
  });
});
