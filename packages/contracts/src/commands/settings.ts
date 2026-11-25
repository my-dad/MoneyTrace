import { z } from "zod";
import { nonNegativeMinorAmount } from "../primitives";
import { avatarSchema } from "../sectors";
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

/** The user's name and picture (Google photo or initials on a colour). Email isn't editable. */
export const updateProfileRequest = strictObject({
  displayName: z.string().min(1).max(200),
  avatar: avatarSchema,
});
export const updateProfileResponse = strictObject({ updated: z.literal(true) });

/** Notes this visit; returns the previous one for the welcome-back overview. */
export const recordVisitRequest = strictObject({});
export const recordVisitResponse = strictObject({ previousSeenAtMs: z.number().int().nonnegative().nullable() });
