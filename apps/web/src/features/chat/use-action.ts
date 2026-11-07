import { useState } from "react";

/** One user action: blocks repeats while it runs, and remembers whether it failed. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setFailed(false);
    try {
      await action();
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, failed, run };
}
