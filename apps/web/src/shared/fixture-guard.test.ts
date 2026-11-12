import { describe, expect, it } from "vitest";
import { assertFixtureModeAllowed } from "./fixture-guard";

describe("assertFixtureModeAllowed", () => {
  it("allows fixture mode on a demo- project", () => {
    expect(() => {
      assertFixtureModeAllowed({
        NEXT_PUBLIC_DATA_SOURCE: "fixture",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-moneytrace",
      });
    }).not.toThrow();
  });

  it("allows fixture mode with no project id", () => {
    expect(() => {
      assertFixtureModeAllowed({ NEXT_PUBLIC_DATA_SOURCE: "fixture" });
    }).not.toThrow();
  });

  it("rejects fixture mode on a real project", () => {
    expect(() => {
      assertFixtureModeAllowed({
        NEXT_PUBLIC_DATA_SOURCE: "fixture",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "moneytrace-staging",
      });
    }).toThrow("Fixture mode requires a demo- Firebase project");
  });

  it("ignores the project when fixture mode is off", () => {
    expect(() => {
      assertFixtureModeAllowed({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: "moneytrace-staging" });
    }).not.toThrow();
  });

  it("rejects an emulator build on a real project", () => {
    expect(() => {
      assertFixtureModeAllowed({ NEXT_PUBLIC_USE_EMULATORS: "1", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "moneytrace-staging" });
    }).toThrow("Emulator mode requires a demo- Firebase project");
  });

  it("allows an emulator build on a demo- project", () => {
    expect(() => {
      assertFixtureModeAllowed({ NEXT_PUBLIC_USE_EMULATORS: "1", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-moneytrace" });
    }).not.toThrow();
  });
});
