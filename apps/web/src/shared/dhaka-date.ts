const TIMEZONE = "Asia/Dhaka";

/** The calendar date in Dhaka, as `YYYY-MM-DD`. */
export const dhakaDate = (ms: number): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date(ms));

/** The instant a `YYYY-MM-DD` date starts in Dhaka. Bangladesh has one fixed offset. */
export const dhakaDayStartMs = (date: string): number => Date.parse(`${date}T00:00:00+06:00`);

export const isDateText = (text: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(text);
