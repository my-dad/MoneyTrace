import { dhakaDay } from "@moneytrace/contracts";

const TIMEZONE = "Asia/Dhaka";

/** The calendar date in Dhaka, as `YYYY-MM-DD` (the rule shared with the server). */
export const dhakaDate = (ms: number): string => dhakaDay(ms);

/** The instant a `YYYY-MM-DD` date starts in Dhaka. Bangladesh has one fixed offset. */
export const dhakaDayStartMs = (date: string): number => Date.parse(`${date}T00:00:00+06:00`);

export const isDateText = (text: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(text);

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, weekday: "short", day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "numeric", minute: "2-digit", hour12: true });

/** "Fri 6 Nov" in Dhaka. */
export const dhakaDayLabel = (ms: number): string => dayFormat.format(new Date(ms)).replace(",", "");
/** "7:02 pm" in Dhaka. */
export const dhakaTimeLabel = (ms: number): string => timeFormat.format(new Date(ms)).toLowerCase();
