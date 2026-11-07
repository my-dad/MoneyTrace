/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { useState, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Button,
  Card,
  Chip,
  Composer,
  EmptyState,
  FormField,
  List,
  ListItem,
  MoneyText,
  StatusBadge,
} from "./index";

afterEach(cleanup);

describe("StatusBadge", () => {
  it.each([
    ["verified", "Verified"],
    ["pending", "Pending"],
    ["needsAnswer", "Needs answer"],
  ] as const)("%s has the visible text %s and an icon, not only color", (status, text) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(screen.getByText(text)).toBeTruthy();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("StatusBadge label", () => {
  it("can say something more specific, keeping the status icon", () => {
    const { container } = render(<StatusBadge status="pending" label="Not saved yet" />);
    expect(screen.getByText("Not saved yet")).toBeTruthy();
    expect(screen.queryByText("Pending")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("MoneyText", () => {
  it("shows the formatted text it is given", () => {
    render(<MoneyText text="৳1,25,000" />);
    expect(screen.getByText("৳1,25,000").className).toContain("mt-money");
  });

  it("unexplained money uses the neutral dashed class, never the failed one", () => {
    render(<MoneyText text="৳5,000" variant="unexplained" />);
    const className = screen.getByText("৳5,000").className;
    expect(className).toContain("mt-money--unexplained");
    expect(className).not.toMatch(/failed|red|danger/);
  });
});

describe("Button", () => {
  it("does not submit a surrounding form unless asked to", () => {
    render(<Button onClick={() => undefined}>Confirm</Button>);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Confirm" }).type).toBe("button");
  });

  it("does not fire when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Confirm
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Chip", () => {
  it("a selected chip says so to assistive tech and shows a check, not only color", () => {
    const { container } = render(
      <Chip selected onClick={() => undefined}>
        My wallet
      </Chip>,
    );
    expect(screen.getByRole("button", { name: "My wallet", pressed: true })).toBeTruthy();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("an unselected chip is reported as not pressed and shows no check", () => {
    const { container } = render(
      <Chip selected={false} onClick={() => undefined}>
        My wallet
      </Chip>,
    );
    expect(screen.getByRole("button", { name: "My wallet", pressed: false })).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("a one-shot quick reply is a plain button, not a toggle", () => {
    render(<Chip onClick={() => undefined}>Not sure yet</Chip>);
    expect(screen.getByRole("button", { name: "Not sure yet" }).hasAttribute("aria-pressed")).toBe(
      false,
    );
  });

  it("calls onClick", () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>Home</Chip>);
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("Composer", () => {
  function setup(initial: string, disabled = false) {
    const onSend = vi.fn();
    function Host() {
      const [value, setValue] = useState(initial);
      return (
        <Composer
          value={value}
          onChange={setValue}
          onSend={onSend}
          disabled={disabled}
          label="Message MoneyTrace"
        />
      );
    }
    render(<Host />);
    const box = screen.getByLabelText<HTMLTextAreaElement>("Message MoneyTrace");
    const send = screen.getByRole<HTMLButtonElement>("button", { name: "Send" });
    return { onSend, box, send };
  }

  it("sends on Enter", () => {
    const { onSend, box } = setup("Tk 500 paid");
    const notPrevented = fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledOnce();
    expect(notPrevented).toBe(false);
  });

  it("adds a line on Shift+Enter instead of sending", () => {
    const { onSend, box } = setup("Tk 500 paid");
    const notPrevented = fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });

  it("does not send when Enter only confirms a Bangla IME composition", () => {
    const { onSend, box } = setup("টাকা");
    const notPrevented = fireEvent.keyDown(box, { key: "Enter", isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });

  it.each(["", "   ", " \n "])("does not send blank text %j", (blank) => {
    const { onSend, box, send } = setup(blank);
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.submit(box.closest("form") as HTMLFormElement);
    expect(onSend).not.toHaveBeenCalled();
    expect(send.disabled).toBe(true);
  });

  it("does not send when disabled, and keeps the draft editable", () => {
    const { onSend, box, send } = setup("Tk 500 paid", true);
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.submit(box.closest("form") as HTMLFormElement);
    expect(onSend).not.toHaveBeenCalled();
    expect(send.disabled).toBe(true);
    expect(box.disabled).toBe(false);
    fireEvent.change(box, { target: { value: "Tk 600 paid" } });
    expect(box.value).toBe("Tk 600 paid");
  });

  it("the send button sends, and does not itself clear the text", () => {
    const { onSend, box, send } = setup("Tk 500 paid");
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledOnce();
    expect(box.value).toBe("Tk 500 paid");
  });
});

describe("FormField", () => {
  it("labels the control and links its hint", () => {
    render(
      <FormField label="Last digits" hint="3 or 4 digits">
        {(control) => <input {...control} />}
      </FormField>,
    );
    const input = screen.getByLabelText("Last digits");
    const described = input.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(described)?.textContent).toBe("3 or 4 digits");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });

  it("marks the control invalid and links the error text", () => {
    render(
      <FormField label="Last digits" hint="3 or 4 digits" error="Enter only the last digits">
        {(control) => <input {...control} />}
      </FormField>,
    );
    const input = screen.getByLabelText("Last digits");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
    const texts = ids.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(["3 or 4 digits", "Enter only the last digits"]);
  });
});

describe("axe", () => {
  const cases: [string, ReactElement][] = [
    ["Button", <Button key="b">Confirm</Button>],
    ["disabled Button", <Button key="b" disabled variant="secondary">Edit</Button>],
    ["Card", <Card key="c">Content</Card>],
    ["StatusBadge", <StatusBadge key="s" status="needsAnswer" />],
    ["MoneyText", <MoneyText key="m" text="৳5,000" variant="unexplained" />],
    ["Chip", <Chip key="c" selected onClick={() => undefined}>Wallet</Chip>],
    [
      "Composer",
      <Composer
        key="c"
        value=""
        onChange={() => undefined}
        onSend={() => undefined}
        disabled={false}
        label="Message MoneyTrace"
      />,
    ],
    [
      "FormField with an error",
      <FormField key="f" label="Digits" hint="3 or 4" error="Too long">
        {(control) => <input {...control} />}
      </FormField>,
    ],
    [
      "ListItem",
      <List key="l">
        <ListItem title="City Bank" subtitle="Due 15 Nov" leading={<svg aria-hidden="true" />} trailing="৳18,450" />
      </List>,
    ],
    ["EmptyState", <EmptyState key="e" title="Nothing recorded yet" description="Paste your first SMS." action={<Button>Add</Button>} />],
  ];

  it.each(cases)("%s has no violations", async (_name, element) => {
    const { container } = render(element);
    // Contrast needs real layout, which jsdom lacks; tokens.test.ts covers it. Region is page-level.
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
