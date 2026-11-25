/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoUnavailableError } from "../../shared/demo-unavailable";
import { FIXTURE_PROFILE } from "../../shared/fixtures/household";
import type { ProfileRow } from "../../shared/read-model-gateway";
import { ProfileScreen } from "./ProfileScreen";

afterEach(cleanup);

const fresh: ProfileRow = { ...FIXTURE_PROFILE };
delete fresh.displayName;
delete fresh.avatar;
delete fresh.profileCompletedAtMs;

const google = { uid: "u1", displayName: "Mabrur Chowdhury", email: "m@example.com", photoUrl: "https://lh3.googleusercontent.com/a/x" };
const ok = () => vi.fn(() => Promise.resolve({ updated: true as const }));

describe("ProfileScreen", () => {
  it("after sign-up: the Google name and photo to start with, and the email can't be changed", () => {
    render(<ProfileScreen mode="setup" user={google} profile={fresh} updateProfile={ok()} onDone={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Set up your profile" })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Mabrur Chowdhury");
    const email = screen.getByLabelText<HTMLInputElement>("Email");
    expect(email.value).toBe("m@example.com");
    expect(email.readOnly).toBe(true);
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Photo from Google" }).checked).toBe(true);
  });

  it("saves the name and picture, then continues", async () => {
    const updateProfile = ok();
    const onDone = vi.fn();
    render(<ProfileScreen mode="setup" user={google} profile={fresh} updateProfile={updateProfile} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Mabrur" } });
    fireEvent.click(screen.getByRole("radio", { name: "Initials on violet" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => { expect(onDone).toHaveBeenCalled(); });
    expect(updateProfile).toHaveBeenCalledWith({ displayName: "Mabrur", avatar: { kind: "initials", color: "violet" } });
  });

  it("without a Google photo, offers initials only, teal to start", () => {
    render(<ProfileScreen mode="setup" user={{ uid: "u2", email: "a@b.c" }} profile={fresh} updateProfile={ok()} onDone={vi.fn()} />);
    expect(screen.queryByRole("radio", { name: "Photo from Google" })).toBeNull();
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Initials on teal" }).checked).toBe(true);
  });

  it("keeps Save off for a blank name", () => {
    render(<ProfileScreen mode="setup" user={google} profile={fresh} updateProfile={ok()} onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Save and continue" }).disabled).toBe(true);
  });

  it("editing later shows the saved choices and says when it's saved", async () => {
    render(<ProfileScreen mode="edit" user={google} profile={FIXTURE_PROFILE} updateProfile={ok()} onDone={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Edit profile" })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Demo");
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Initials on teal" }).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved.");
  });

  it("says the demo saved nothing", async () => {
    render(<ProfileScreen mode="edit" user={google} profile={FIXTURE_PROFILE} updateProfile={() => Promise.reject(new DemoUnavailableError())} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => { expect(screen.getByRole("status").textContent).toMatch(/demo/); });
  });
});
