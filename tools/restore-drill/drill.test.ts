import { describe, expect, it } from "vitest";
import { assertAllowedProject } from "./drill";

describe("restore drill project guard", () => {
  it("allows the emulator and staging project IDs", () => {
    expect(() => { assertAllowedProject("demo-moneytrace"); }).not.toThrow();
    expect(() => { assertAllowedProject("moneytrace-staging"); }).not.toThrow();
  });

  it("refuses every other project ID", () => {
    expect(() => { assertAllowedProject("moneytrace-dev"); }).toThrow(/refusing project/);
    expect(() => { assertAllowedProject("production"); }).toThrow(/refusing project/);
  });
});
