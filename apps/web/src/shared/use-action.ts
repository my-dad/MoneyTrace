import { useState } from "react";
import { DemoUnavailableError } from "./demo-unavailable";

/** One user action: blocks repeats while it runs, and remembers whether it failed. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // A demo rejection is still a failure: nothing was saved.
  const [unavailable, setUnavailable] = useState(false);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setFailed(false);
    setUnavailable(false);
    try {
      await action();
      return true;
    } catch (error) {
      setFailed(true);
      setUnavailable(error instanceof DemoUnavailableError);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, failed, unavailable, run };
}
