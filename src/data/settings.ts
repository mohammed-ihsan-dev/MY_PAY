import { DEFAULT_SALARY_SETTINGS, type SalarySettingsValues } from "@/lib/types";
import { rupeesToPaise } from "@/lib/money";
import { todayKey } from "@/lib/dates";
import { settingsInputSchema } from "@/lib/validation";
import type { CalculatorParams } from "@/lib/salary-calculator";
import { db, nowIso, type SettingsRecord } from "./db";

export interface SettingsView extends SalarySettingsValues {
  updatedAt: string | null;
}

function view(r: Partial<SettingsRecord> | undefined): SettingsView {
  return {
    monthlyBasicSalaryPaise: r?.monthlyBasicSalaryPaise ?? DEFAULT_SALARY_SETTINGS.monthlyBasicSalaryPaise,
    salaryDivisor: r?.salaryDivisor ?? DEFAULT_SALARY_SETTINGS.salaryDivisor,
    standardDailyHours: r?.standardDailyHours ?? DEFAULT_SALARY_SETTINGS.standardDailyHours,
    overtimeMultiplier: r?.overtimeMultiplier ?? DEFAULT_SALARY_SETTINGS.overtimeMultiplier,
    paydayDay: r?.paydayDay ?? DEFAULT_SALARY_SETTINGS.paydayDay,
    currency: "INR",
    timezone: r?.timezone ?? DEFAULT_SALARY_SETTINGS.timezone,
    updatedAt: r?.updatedAt ?? null,
  };
}

/** Current settings. Read-only (safe inside live queries); falls back to the ₹17,000 defaults. */
export async function getSettings(): Promise<SettingsView> {
  return view(await db().settings.get("salary"));
}

/** First run: store the default settings once. */
export async function ensureSettings(): Promise<void> {
  await db().transaction("rw", db().settings, async () => {
    if (!(await db().settings.get("salary"))) {
      await db().settings.put({ id: "salary", ...DEFAULT_SALARY_SETTINGS, updatedAt: nowIso() });
    }
  });
}

/** Saves new settings. Saved salary months keep their own copy and are never recalculated. */
export async function updateSettings(raw: unknown): Promise<SettingsView> {
  const input = settingsInputSchema.parse(raw);
  const record: SettingsRecord = {
    id: "salary",
    monthlyBasicSalaryPaise: rupeesToPaise(input.monthlyBasicSalary),
    salaryDivisor: input.salaryDivisor,
    standardDailyHours: input.standardDailyHours,
    overtimeMultiplier: input.overtimeMultiplier,
    paydayDay: input.paydayDay,
    currency: "INR",
    timezone: input.timezone,
    updatedAt: nowIso(),
  };
  await db().settings.put(record);
  return view(record);
}

export function calculatorParams(s: Pick<SalarySettingsValues, "salaryDivisor" | "standardDailyHours" | "overtimeMultiplier">): CalculatorParams {
  return { salaryDivisorDays: s.salaryDivisor, standardWorkingHours: s.standardDailyHours, overtimeMultiplier: s.overtimeMultiplier };
}

export async function today(): Promise<string> {
  return todayKey((await getSettings()).timezone);
}
