import { z } from "zod";
import { nonNegativeMinorAmount } from "../primitives";
import { strictObject } from "./shared";

const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const updateSettingsRequest = strictObject({
  timezone: z.string().min(1).max(64).optional(),
  reportingCycle: z
    .discriminatedUnion("kind", [
      strictObject({ kind: z.literal("calendarMonth") }),
      strictObject({ kind: z.literal("salaryCycle"), startDay: z.number().int().min(1).max(28) }),
    ])
    .optional(),
  reminders: strictObject({
    digestLocalTime: localTime,
    frequency: z.enum(["daily", "weekly", "off"]),
    minThresholdMinor: nonNegativeMinorAmount,
    quietHours: strictObject({ startLocalTime: localTime, endLocalTime: localTime }).optional(),
  }).optional(),
  aiBudget: strictObject({
    monthlyMicroUsd: z.number().int().nonnegative(),
    dailyMicroUsd: z.number().int().nonnegative(),
    perRequestMicroUsd: z.number().int().nonnegative(),
  }).optional(),
});
export const updateSettingsResponse = strictObject({ updated: z.boolean() });
