// Shared domain types used by both server services and client components.
// Money fields ending in "Paise" are integer paise (₹1 = 100 paise).

/** The ONE place the default salary configuration lives. Every calculation reads settings derived from this. */
export interface SalarySettingsValues {
  monthlyBasicSalaryPaise: number;
  salaryDivisor: number;
  standardDailyHours: number;
  overtimeMultiplier: number;
  paydayDay: number; // a month's salary is paid on this day of the FOLLOWING month (10 → October salary paid 10 Nov)
  currency: "INR";
  timezone: string;
}

export const DEFAULT_SALARY_SETTINGS: SalarySettingsValues = {
  monthlyBasicSalaryPaise: 1_700_000, // ₹17,000
  salaryDivisor: 30,
  standardDailyHours: 7.5,
  overtimeMultiplier: 1,
  paydayDay: 10,
  currency: "INR",
  timezone: "Asia/Kolkata",
};

export type Direction = "in" | "out";
export type LedgerKind = "salary" | "income" | "expense" | "debt_repayment" | "borrowed";
export type LedgerStatus = "active" | "reversed";

export const INCOME_CATEGORIES = [
  { value: "freelance", label: "Freelance" },
  { value: "additional_work", label: "Additional work" },
  { value: "business", label: "Business" },
  { value: "gift", label: "Gift" },
  { value: "refund", label: "Refund" },
  { value: "other_income", label: "Other income" },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: "food", label: "Food" },
  { value: "transportation", label: "Transportation" },
  { value: "shopping", label: "Shopping" },
  { value: "bills", label: "Bills & recharge" },
  { value: "health", label: "Health" },
  { value: "personal", label: "Personal" },
  { value: "other_expense", label: "Other spending" },
] as const;

/** Categories used by system-created entries, plus older categories kept for imported records. */
const SYSTEM_CATEGORIES = [
  { value: "salary", label: "Salary" },
  { value: "debt_repayment", label: "Debt repayment" },
  { value: "borrowed", label: "Borrowed money" },
  { value: "subscriptions", label: "Subscriptions" },
  { value: "entertainment", label: "Entertainment" },
] as const;

export const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, ...SYSTEM_CATEGORIES];

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]["value"];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];

export function categoryLabel(value: string): string {
  return ALL_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export const DEDUCTION_CATEGORIES = [
  { value: "late_fine", label: "Late Fine" },
  { value: "half_day_fine", label: "Half-Day Fine" },
  { value: "full_day_fine", label: "Full-Day Fine" },
  { value: "attendance_fine", label: "Attendance Fine" },
  { value: "other_fine", label: "Other Fine" },
  { value: "other_deduction", label: "Other Deduction" },
] as const;
export type DeductionCategory = (typeof DEDUCTION_CATEGORIES)[number]["value"];
export const deductionLabel = (v: string) => DEDUCTION_CATEGORIES.find((c) => c.value === v)?.label ?? v;

/** DRAFT: being calculated · FINALIZED: calculated and locked · RECEIVED: paid and credited to the balance. */
export type SalaryStatus = "draft" | "finalized" | "received";

export type DebtStatus = "active" | "paid";
export type DebtPaymentStatus = "paid" | "reversed";
