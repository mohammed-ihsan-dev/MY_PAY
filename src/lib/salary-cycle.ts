import { addMonths, format, parse, subDays } from "date-fns";
import { isValidMonth } from "./dates";

// Salary cycles follow the CALENDAR MONTH of work, and are paid on the payday
// (default the 10th) of the FOLLOWING month:
//
//   October 2026 salary = work from 1 Oct to 31 Oct 2026, paid on 10 Nov 2026.
//
// Boundaries: start date INCLUSIVE, end date EXCLUSIVE (the 1st of the next
// month), so every day belongs to exactly one cycle.
//
// A cycle is identified by its key "YYYY-MM" (the month worked).

export interface SalaryCycle {
  key: string; // "2026-10"
  label: string; // "October 2026"
  startDate: string; // "2026-10-01" (inclusive)
  endDate: string; // "2026-11-01" (exclusive — the next cycle's start)
  payDate: string; // "2026-11-10"
}

const REF = new Date(2000, 0, 1);
const monthStart = (key: string) => parse(`${key}-01`, "yyyy-MM-dd", REF);
const pad = (n: number) => String(n).padStart(2, "0");

export function shiftCycle(key: string, delta: number): string {
  return format(addMonths(monthStart(key), delta), "yyyy-MM");
}

/** The cycle with the given month key. */
export function cycleByKey(key: string, payday = 10): SalaryCycle {
  if (!isValidMonth(key)) throw new Error("Cycle key must be YYYY-MM.");
  if (!Number.isInteger(payday) || payday < 1 || payday > 28) throw new Error("Payday must be 1–28.");
  const next = shiftCycle(key, 1);
  return {
    key,
    label: format(monthStart(key), "MMMM yyyy"),
    startDate: `${key}-01`,
    endDate: `${next}-01`,
    payDate: `${next}-${pad(payday)}`,
  };
}

/** The cycle (month worked) that contains a local date (YYYY-MM-DD). */
export function cycleKeyForDate(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function cycleForDate(dateKey: string, payday = 10): SalaryCycle {
  return cycleByKey(cycleKeyForDate(dateKey), payday);
}

export function isDateInCycle(dateKey: string, cycle: Pick<SalaryCycle, "startDate" | "endDate">): boolean {
  return dateKey >= cycle.startDate && dateKey < cycle.endDate;
}

/** Last day of the cycle (the day before the exclusive end). */
export function cycleLastDay(cycle: Pick<SalaryCycle, "endDate">): string {
  return format(subDays(parse(cycle.endDate, "yyyy-MM-dd", REF), 1), "yyyy-MM-dd");
}

const upper = (d: string) => format(parse(d, "yyyy-MM-dd", REF), "dd MMM yyyy").toUpperCase();

/** "01 OCT 2026 – 31 OCT 2026" */
export function formatCyclePeriod(cycle: Pick<SalaryCycle, "startDate" | "endDate">): string {
  return `${upper(cycle.startDate)} – ${upper(cycleLastDay(cycle))}`;
}

/** "10 NOV 2026" */
export function formatPayDate(cycle: Pick<SalaryCycle, "payDate">): string {
  return upper(cycle.payDate);
}
