import { asOwnerId, asSourceEventId } from "@moneytrace/domain";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { REGION, TIMEOUT_SECONDS } from "../callable/create-callable";
import type { Deps } from "../composition";
import { TRIGGERS } from "@moneytrace/contracts";

/**
 * Fires on every write, because reopening an expired claim leaves `status` unchanged. A redundant
 * run finds nothing to do or loses the claim race, so it is harmless.
 */
export const onSourceEventWritten = (getDeps: () => Deps) =>
  onDocumentWritten(
    {
      document: TRIGGERS.onSourceEventWritten.source,
      region: REGION,
      timeoutSeconds: TIMEOUT_SECONDS,
      maxInstances: 2,
      secrets: ["DEEPSEEK_API_KEY"],
    },
    async (event) => {
      if (event.data?.after.exists !== true) return;
      const deps = getDeps();
      const { uid, id } = event.params;
      await deps.advanceSourceEvent.execute({
        ownerId: asOwnerId(uid),
        sourceEventId: asSourceEventId(id),
        workerId: `${id}-${deps.ids.newId()}`.slice(0, 128),
      });
    },
  );
