import { z } from "zod";
import { strictObject } from "./shared";

/** Saves the month's tip figures and, when due, asks for fresh advice. `force` is "New tips". */
export const refreshTipsRequest = strictObject({ force: z.boolean() });
export const refreshTipsResponse = strictObject({
  outcome: z.enum(["made", "unchanged", "factsOnly", "notEnoughData", "limitReached"]),
});
