import { describe, expect, it } from "vitest";
import { assertAllowedProject, parseOptions } from "./drill";

const EMU = { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" };
const argv = (...args: string[]) => ["node", "drill.ts", ...args];

describe("restore drill project guard", () => {
  it("allows the emulator and staging project IDs", () => {
    expect(() => {
      assertAllowedProject("demo-moneytrace");
    }).not.toThrow();
    expect(() => {
      assertAllowedProject("moneytrace-staging");
    }).not.toThrow();
  });

  it("refuses every other project ID", () => {
    expect(() => {
      assertAllowedProject("moneytrace-dev");
    }).toThrow(/refusing project/);
    expect(() => {
      assertAllowedProject("production");
    }).toThrow(/refusing project/);
  });
});

describe("parseOptions", () => {
  it("accepts a local emulator drill", () => {
    expect(parseOptions(argv("verify", "--expected", "x.json"), EMU)).toEqual({
      command: "verify",
      projectId: "demo-moneytrace",
      databaseId: "(default)",
      expected: "x.json",
    });
  });

  it("requires a restored database on staging, never the live (default) one", () => {
    expect(() => parseOptions(argv("verify", "--project", "moneytrace-staging", "--expected", "x.json"), {})).toThrow(
      "--database",
    );
    expect(() =>
      parseOptions(argv("verify", "--project", "moneytrace-staging", "--database", "(default)", "--expected", "x.json"), {}),
    ).toThrow("live database");
    expect(
      parseOptions(argv("verify", "--project", "moneytrace-staging", "--database", "restore-drill", "--expected", "x.json"), {}),
    ).toMatchObject({ databaseId: "restore-drill" });
  });

  it("refuses a staging drill while the emulator host is set, and an emulator drill without it", () => {
    expect(() =>
      parseOptions(argv("verify", "--project", "moneytrace-staging", "--database", "restore-drill", "--expected", "x.json"), EMU),
    ).toThrow("FIRESTORE_EMULATOR_HOST");
    expect(() => parseOptions(argv("seed", "--expected", "x.json"), {})).toThrow("FIRESTORE_EMULATOR_HOST");
  });

  it("checks its arguments before doing anything", () => {
    expect(() => parseOptions(argv("seed", "--expected"), EMU)).toThrow("--expected");
    expect(() => parseOptions(argv("seed", "--expected", "--project", "demo-moneytrace"), EMU)).toThrow("--expected");
    expect(() => parseOptions(argv("wipe"), EMU)).toThrow("usage");
  });
});
