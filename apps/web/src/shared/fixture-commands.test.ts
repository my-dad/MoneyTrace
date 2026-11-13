import { describe, expect, it } from "vitest";
import { DemoUnavailableError } from "./demo-unavailable";
import { createFixtureCommands } from "./fixture-commands";

describe("createFixtureCommands", () => {
  it("every command rejects with DemoUnavailableError", async () => {
    const commands = createFixtureCommands();
    const names = Object.keys(commands) as (keyof typeof commands)[];
    expect(names).toHaveLength(16);
    for (const name of names) {
      const call = commands[name] as (request: unknown) => Promise<unknown>;
      await expect(call({})).rejects.toBeInstanceOf(DemoUnavailableError);
    }
  });
});
