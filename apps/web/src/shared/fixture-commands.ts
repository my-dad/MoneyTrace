import { PHASE_ONE_COMMANDS, type Commands } from "./commands";
import { DemoUnavailableError } from "./demo-unavailable";

/** Demo commands never claim success: every call rejects. */
export function createFixtureCommands(): Commands {
  return Object.fromEntries(
    PHASE_ONE_COMMANDS.map((name) => [name, () => Promise.reject(new DemoUnavailableError())]),
  ) as unknown as Commands;
}
