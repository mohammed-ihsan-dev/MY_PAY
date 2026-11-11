import { formatInTimeZone } from "date-fns-tz";
import { format, parse } from "date-fns";

export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in YYYY-MM-DD form. */
export function isValidDateKey(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isValidMonth(value: string): boolean {
  return MONTH_RE.test(value);
}

/** Today's date (YYYY-MM-DD) in the given timezone. */
export function todayKey(timeZone = DEFAULT_TIMEZONE, now = new Date()): string {
  return formatInTimeZone(now, timeZone, "yyyy-MM-dd");
}

export function formatDateKey(dateKey: string, pattern = "dd MMM yyyy"): string {
  return format(parse(dateKey, "yyyy-MM-dd", new Date(2000, 0, 1)), pattern);
}

export function formatDateTime(value: Date | string | null | undefined, timeZone = DEFAULT_TIMEZONE): string {
  if (!value) return "—";
  return formatInTimeZone(new Date(value), timeZone, "dd MMM yyyy, h:mm a");
}
