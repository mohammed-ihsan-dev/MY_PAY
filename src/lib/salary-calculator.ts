import { Decimal, roundPaise, rupeesToPaise } from "./money";

// Salary calculation: pure logic shared by the browser (live results) and the
// server (saving). Everything is entered by hand: there is NO attendance data,
// NO check-in/out and NO 6 PM / 7 PM rule. The user enters the cycle's TOTAL
// overtime and it is paid at hourly rate × multiplier.

export const CALCULATOR_VERSION = 1;
export const MAX_OVERTIME_HOURS = 744; // 31 days × 24 h: anything above is a typo
export const MAX_MONTHLY_SALARY = 100_000_000; // ₹10 crore

export interface CalculatorParams {
  salaryDivisorDays: number; // 30
  standardWorkingHours: number; // 7.5
  overtimeMultiplier: number; // 1
}

export const DEFAULT_CALCULATOR_PARAMS: CalculatorParams = {
  salaryDivisorDays: 30,
  standardWorkingHours: 7.5,
  overtimeMultiplier: 1,
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface OvertimeDuration {
  hours: number;
  minutes: number; // 0–59
  totalMinutes: number;
}

// "3.21" / "3:21" (hours + exactly two minute digits), "3" (whole hours), ".30" / ":30".
const DURATION_RE = /^(\d{0,3})(?:([.:])(\d*))?$/;

/**
 * Parses a duration in H.MM (or H:MM) form, where the part after the separator
 * is MINUTES, not a decimal fraction: "3.21" = 3 h 21 min = 201 min.
 * Empty input means zero.
 */
export function parseHoursMinutes(raw: string, maxHours: number, what = "Duration"): ParseResult<OvertimeDuration> {
  const input = raw.trim().replace(/\s+/g, "");
  if (input === "") return { ok: true, value: { hours: 0, minutes: 0, totalMinutes: 0 } };
  if (input.startsWith("-")) return { ok: false, error: `${what} cannot be negative.` };

  const m = DURATION_RE.exec(input);
  if (!m) return { ok: false, error: "Use hours.minutes, e.g. 3.21 for 3 hours 21 minutes." };
  const [, h, sep, mm] = m;
  if (!h && !sep) return { ok: false, error: "Enter a duration such as 3.21." };
  if (sep && mm.length !== 2) {
    return {
      ok: false,
      error: mm.length === 0 ? "Add the minutes after the separator, e.g. 3.05 or 3.30." : "Use two digits for minutes, e.g. 3.05 for 5 minutes or 3.50 for 50 minutes.",
    };
  }
  const hours = h ? Number(h) : 0;
  const minutes = sep ? Number(mm) : 0;
  if (minutes > 59) return { ok: false, error: `Minutes must be between 00 and 59 (got ${mm}).` };
  if (hours > maxHours) return { ok: false, error: `${what} cannot exceed ${maxHours} hours in a salary cycle.` };
  return { ok: true, value: { hours, minutes, totalMinutes: hours * 60 + minutes } };
}

/** Total overtime for a salary cycle, H.MM: "3.21" = 3 hours 21 minutes. */
export function parseOvertimeDuration(raw: string): ParseResult<OvertimeDuration> {
  return parseHoursMinutes(raw, MAX_OVERTIME_HOURS, "Overtime");
}

/** Rupee amount entered by the user → integer paise. Empty is an error (salary is required). */
export function parseMonthlySalary(raw: string): ParseResult<number> {
  const input = raw.trim().replace(/[,\s₹]/g, "");
  if (input === "") return { ok: false, error: "Enter your monthly basic salary." };
  if (input.startsWith("-")) return { ok: false, error: "Salary cannot be negative." };
  if (!/^\d+(\.\d{0,2})?$/.test(input)) return { ok: false, error: "Enter a valid amount with at most 2 decimal places." };
  const value = Number(input);
  if (value > MAX_MONTHLY_SALARY) return { ok: false, error: "That amount is too large." };
  return { ok: true, value: rupeesToPaise(input) };
}

/** 201 → "3 hours 21 minutes"; 60 → "1 hour"; 0 → "0 minutes". */
export function describeDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const hs = `${h} hour${h === 1 ? "" : "s"}`;
  const ms = `${m} minute${m === 1 ? "" : "s"}`;
  if (h === 0) return ms;
  return m === 0 ? hs : `${hs} ${ms}`;
}

/** 201 → "3.21" (the H.MM notation used by the input). */
export function formatHMM(totalMinutes: number): string {
  const t = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(t / 60)}.${String(t % 60).padStart(2, "0")}`;
}

export interface ManualSalaryResult {
  monthlySalaryPaise: number;
  overtimeMinutes: number;
  /** Decimal hours, e.g. 201 min → "3.35" (exact string; may be recurring, e.g. 1/3 h). */
  overtimeHoursExact: string;
  dailySalaryExact: string; // paise, full precision
  hourlySalaryExact: string;
  overtimeHourlyRateExact: string;
  overtimePaymentExact: string;
  dailySalaryPaise: number; // rounded, for display
  hourlySalaryPaise: number;
  overtimeHourlyRatePaise: number;
  overtimePaymentPaise: number;
  totalPaise: number;
  params: CalculatorParams;
  version: number;
}

/**
 * Daily = salary ÷ divisor; Hourly = daily ÷ hours; Overtime = hourly × (minutes ÷ 60) × multiplier;
 * Total = salary + overtime. Full precision throughout; rounded to paise (half-up) only for output.
 */
export function calculateManualSalary(
  monthlySalaryPaise: number,
  overtimeMinutes: number,
  params: CalculatorParams = DEFAULT_CALCULATOR_PARAMS
): ManualSalaryResult {
  if (!Number.isInteger(monthlySalaryPaise) || monthlySalaryPaise < 0) throw new Error("Salary must be a non-negative whole number of paise.");
  if (!Number.isInteger(overtimeMinutes) || overtimeMinutes < 0) throw new Error("Overtime must be a non-negative whole number of minutes.");
  if (params.salaryDivisorDays <= 0 || params.standardWorkingHours <= 0 || params.overtimeMultiplier < 0) {
    throw new Error("Invalid calculator parameters.");
  }

  const daily = new Decimal(monthlySalaryPaise).dividedBy(params.salaryDivisorDays);
  const hourly = daily.dividedBy(params.standardWorkingHours);
  const otHourly = hourly.times(params.overtimeMultiplier);
  const otHours = new Decimal(overtimeMinutes).dividedBy(60);
  // Multiply before dividing to keep the exact value (hourly × minutes ÷ 60).
  const otPayment = otHourly.times(overtimeMinutes).dividedBy(60);
  const overtimePaymentPaise = roundPaise(otPayment);

  return {
    monthlySalaryPaise,
    overtimeMinutes,
    overtimeHoursExact: otHours.toString(),
    dailySalaryExact: daily.toString(),
    hourlySalaryExact: hourly.toString(),
    overtimeHourlyRateExact: otHourly.toString(),
    overtimePaymentExact: otPayment.toString(),
    dailySalaryPaise: roundPaise(daily),
    hourlySalaryPaise: roundPaise(hourly),
    overtimeHourlyRatePaise: roundPaise(otHourly),
    overtimePaymentPaise,
    totalPaise: monthlySalaryPaise + overtimePaymentPaise,
    params: { ...params },
    version: CALCULATOR_VERSION,
  };
}

/** Exact paise string → "₹44.444444" style rupee string with `digits` decimals (for "approximately" displays). */
export function exactRupees(paiseExact: string, digits = 6): string {
  return new Decimal(paiseExact).dividedBy(100).toFixed(digits);
}

// ── Deductions → final salary payable ────────────────────────────────────────

export interface PayableResult {
  grossSalaryPaise: number;
  totalDeductionsPaise: number;
  finalSalaryPayablePaise: number;
  /** Set when deductions are more than the gross salary (final would be negative). */
  error: string | null;
}

/** Final salary payable = gross salary − total deductions. Never negative. */
export function finalPayable(grossSalaryPaise: number, deductions: { amountPaise: number }[]): PayableResult {
  if (deductions.some((d) => !Number.isInteger(d.amountPaise) || d.amountPaise <= 0)) throw new Error("Each deduction must be a positive whole number of paise.");
  const totalDeductionsPaise = deductions.reduce((s, d) => s + d.amountPaise, 0);
  const finalSalaryPayablePaise = grossSalaryPaise - totalDeductionsPaise;
  return {
    grossSalaryPaise,
    totalDeductionsPaise,
    finalSalaryPayablePaise,
    error: finalSalaryPayablePaise < 0 ? "Deductions are more than the gross salary. The final salary payable cannot be negative." : null,
  };
}
