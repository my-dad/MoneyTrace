/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createFixtureAuthGateway } from "../auth/fixture-auth-gateway";
import type { AppServices } from "../../shared/app-services";
import { createFixtureCommands } from "../../shared/fixture-commands";
import { InMemoryReadModelGateway } from "../../shared/in-memory-read-model-gateway";
import { AppShell } from "./AppShell";

afterEach(cleanup);

const services = (fixture: boolean): AppServices => ({
  auth: createFixtureAuthGateway(),
  readModels: new InMemoryReadModelGateway(),
  commands: createFixtureCommands(),
  fixture,
});

describe("AppShell", () => {
  it("shows the Demo data marker in fixture mode", async () => {
    render(<AppShell services={services(true)}><p>content</p></AppShell>);
    expect(screen.getByRole("note").textContent).toBe("Demo data");
    expect(await screen.findByText("content")).toBeTruthy();
  });

  it("shows no marker in Firebase mode", async () => {
    render(<AppShell services={services(false)}><p>content</p></AppShell>);
    expect(await screen.findByText("content")).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull();
  });
});
