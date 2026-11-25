/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_PROFILE } from "../../shared/fixtures/household";
import { InMemoryReadModelGateway } from "../../shared/in-memory-read-model-gateway";
import type { ProfileRow } from "../../shared/read-model-gateway";
import { ProfileGate } from "./ProfileGate";

afterEach(cleanup);

const gatewayWith = (profile: ProfileRow | null) => {
  const g = new InMemoryReadModelGateway();
  g.setProfile(profile);
  return g;
};
const show = (profile: ProfileRow | null) =>
  render(
    <ProfileGate gateway={gatewayWith(profile)} user={{ uid: "u1", displayName: "M" }} updateProfile={() => Promise.resolve({ updated: true })}>
      {() => <p>the dashboard</p>}
    </ProfileGate>,
  );

describe("ProfileGate", () => {
  it("sends a new user to set up their profile first", () => {
    const fresh: ProfileRow = { ...FIXTURE_PROFILE };
    delete fresh.profileCompletedAtMs;
    show(fresh);
    expect(screen.getByRole("heading", { name: "Set up your profile" })).toBeTruthy();
    expect(screen.queryByText("the dashboard")).toBeNull();
  });

  it("goes straight to the dashboard once the profile is set up", () => {
    show(FIXTURE_PROFILE);
    expect(screen.getByText("the dashboard")).toBeTruthy();
  });

  it("waits while the profile is still being made", () => {
    show(null);
    expect(screen.getByRole("status").textContent).toBe("Setting up your account");
  });
});
