import { COPY } from "../../shared/copy";

/** The honest outcome of a user action. It never reports success; screens do that from read models. */
export function ActionStatus({
  failed,
  unavailable,
}: {
  busy: boolean;
  failed: boolean;
  unavailable: boolean;
}) {
  if (unavailable) return <p role="status">{COPY.demoUnavailable}</p>;
  if (failed) return <p role="status">{COPY.failed}</p>;
  return null;
}
