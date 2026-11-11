import { formatINR } from "@/lib/money";
import { isValidMonth, todayKey } from "@/lib/dates";
import { cycleByKey, cycleKeyForDate, type SalaryCycle } from "@/lib/salary-cycle";
import { calculateManualSalary, CALCULATOR_VERSION, finalPayable, parseMonthlySalary, parseOvertimeDuration, type CalculatorParams } from "@/lib/salary-calculator";
import { deductionInputSchema, receiveSalarySchema, reopenSchema, salaryCycleInputSchema } from "@/lib/validation";
import { rupeesToPaise } from "@/lib/money";
import { AppError } from "@/lib/errors";
import type { SalaryStatus } from "@/lib/types";
import { z } from "zod";
import { db, newId, nowIso, type CycleRecord, type DeductionItem, type SalarySnapshot } from "./db";
import { assertNotFuture, insertEntry, markReversed } from "./ledger";
import { calculatorParams, getSettings, type SettingsView } from "./settings";

// Salary months: one per calendar month worked, paid on the payday (10th) of
// the next month. Workflow:
//
//   DRAFT      enter salary, hours, overtime and deductions (all editable)
//   FINALIZED  calculation locked; an immutable snapshot is stored. No money moves.
//   RECEIVED   ONE ledger credit of the FINAL SALARY PAYABLE (gross − deductions),
//              unique per month (sourceKey "salary:<month>").
//
// Deductions (fines) are part of the salary calculation only. They are never
// ledger expenses, so they can never be subtracted from the balance twice.

export type { DeductionItem, SalarySnapshot };

export interface CycleRecordView {
  cycleKey: string;
  label: string;
  startDate: string;
  endDate: string;
  basicSalaryPaise: number;
  params: CalculatorParams;
  workingMinutes: number;
  overtimeInput: string;
  overtimeMinutes: number;
  dailySalaryExact: string;
  hourlySalaryExact: string;
  overtimeEarningsPaise: number;
  /** Gross salary (basic + overtime). */
  totalEarningsPaise: number;
  grossSalaryPaise: number;
  deductionItems: DeductionItem[];
  totalDeductionsPaise: number;
  finalSalaryPayablePaise: number;
  status: SalaryStatus;
  finalizedAt: string | null;
  receivedAt: string | null;
  finalizations: SalarySnapshot[];
  notes: string;
  received: boolean;
  receivedOn: string | null;
  receivedAmountPaise: number | null;
  updatedAt: string;
}

export interface CycleState {
  cycle: SalaryCycle;
  currentKey: string;
  record: CycleRecordView | null;
  settings: SettingsView;
  settingsDiffer: boolean;
}

export const recordView = (r: CycleRecord): CycleRecordView => ({
  cycleKey: r.cycleKey,
  label: r.label,
  startDate: r.startDate,
  endDate: r.endDate,
  basicSalaryPaise: r.basicSalaryPaise,
  params: { salaryDivisorDays: r.salaryDivisor, standardWorkingHours: r.standardDailyHours, overtimeMultiplier: r.overtimeMultiplier },
  workingMinutes: r.workingMinutes,
  overtimeInput: r.overtimeInput,
  overtimeMinutes: r.overtimeMinutes,
  dailySalaryExact: r.dailySalaryExact,
  hourlySalaryExact: r.hourlySalaryExact,
  overtimeEarningsPaise: r.overtimeEarningsPaise,
  totalEarningsPaise: r.totalEarningsPaise,
  grossSalaryPaise: r.grossSalaryPaise,
  deductionItems: [...r.deductionItems].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  totalDeductionsPaise: r.totalDeductionsPaise,
  finalSalaryPayablePaise: r.finalSalaryPayablePaise,
  status: r.status,
  finalizedAt: r.finalizedAt,
  receivedAt: r.receivedAt,
  finalizations: r.finalizations,
  notes: r.notes,
  received: r.received,
  receivedOn: r.receivedOn,
  receivedAmountPaise: r.receivedAmountPaise,
  updatedAt: r.updatedAt,
});

export function currentCycleKey(settings: SettingsView, now = new Date()): string {
  return cycleKeyForDate(todayKey(settings.timezone, now));
}

function assertKey(key: string, currentKey: string) {
  if (!isValidMonth(key)) throw AppError.badRequest("Unknown salary month.");
  if (key > currentKey) throw AppError.badRequest("That salary month has not started yet.");
}

export async function getCycleState(key?: string): Promise<CycleState> {
  const settings = await getSettings();
  const currentKey = currentCycleKey(settings);
  const cycleKey = key ?? currentKey;
  assertKey(cycleKey, currentKey);
  const doc = await db().cycles.get(cycleKey);
  const record = doc ? recordView(doc) : null;
  const p = calculatorParams(settings);
  const settingsDiffer =
    !!record &&
    record.status === "draft" &&
    (record.params.salaryDivisorDays !== p.salaryDivisorDays || record.params.standardWorkingHours !== p.standardWorkingHours || record.params.overtimeMultiplier !== p.overtimeMultiplier);
  return { cycle: cycleByKey(cycleKey, settings.paydayDay), currentKey, record, settings, settingsDiffer };
}

export async function listCycleRecords(): Promise<CycleRecordView[]> {
  return (await db().cycles.orderBy("cycleKey").reverse().limit(36).toArray()).map(recordView);
}

const draftOnly = (rec: CycleRecord | undefined) => {
  if (rec?.status === "received") throw AppError.conflict("This salary is already received and locked. Undo “received” first, then reopen it to make changes.");
  if (rec?.status === "finalized") throw AppError.conflict("This salary is finalized and locked. Reopen it to make changes.");
};

/** Recomputes the deduction totals and final payable on a record. Throws if it would be negative. */
function withTotals(rec: CycleRecord): CycleRecord {
  const p = finalPayable(rec.grossSalaryPaise, rec.deductionItems);
  if (p.error) {
    throw AppError.badRequest(`Total deductions (${formatINR(p.totalDeductionsPaise)}) are more than the gross salary (${formatINR(p.grossSalaryPaise)}). The final salary payable cannot be negative.`, "amount");
  }
  return { ...rec, totalDeductionsPaise: p.totalDeductionsPaise, finalSalaryPayablePaise: p.finalSalaryPayablePaise };
}

const saveSchema = salaryCycleInputSchema.extend({ applyCurrentSettings: z.boolean().optional().default(false) });

function newRecord(state: CycleState, at: string): CycleRecord {
  return {
    cycleKey: state.cycle.key,
    label: state.cycle.label,
    startDate: state.cycle.startDate,
    endDate: state.cycle.endDate,
    payDate: state.cycle.payDate,
    basicSalaryPaise: 0,
    salaryDivisor: state.settings.salaryDivisor,
    standardDailyHours: state.settings.standardDailyHours,
    overtimeMultiplier: state.settings.overtimeMultiplier,
    workingMinutes: 0,
    overtimeInput: "",
    overtimeMinutes: 0,
    dailySalaryExact: "0",
    hourlySalaryExact: "0",
    dailySalaryPaise: 0,
    hourlySalaryPaise: 0,
    overtimeEarningsPaise: 0,
    totalEarningsPaise: 0,
    calculatorVersion: CALCULATOR_VERSION,
    deductionItems: [],
    totalDeductionsPaise: 0,
    grossSalaryPaise: 0,
    finalSalaryPayablePaise: 0,
    status: "draft",
    finalizedAt: null,
    receivedAt: null,
    receivedLedgerTransactionId: null,
    finalizations: [],
    notes: "",
    received: false,
    receivedOn: null,
    receivedAmountPaise: null,
    ledgerEntryId: null,
    createdAt: at,
    updatedAt: at,
  };
}

/** Saves a DRAFT month's salary inputs. Everything is recalculated here; deductions are kept. */
export async function saveCycle(key: string, raw: unknown): Promise<CycleRecordView> {
  const input = saveSchema.parse(raw);
  const state = await getCycleState(key);
  const salary = parseMonthlySalary(input.basicSalary);
  if (!salary.ok) throw AppError.badRequest(salary.error, "basicSalary");
  const overtime = parseOvertimeDuration(input.overtime);
  if (!overtime.ok) throw AppError.badRequest(overtime.error, "overtime");

  return db().transaction("rw", db().cycles, async () => {
    const existing = await db().cycles.get(key);
    draftOnly(existing);
    const params: CalculatorParams = existing && !input.applyCurrentSettings ? recordView(existing).params : calculatorParams(state.settings);
    const r = calculateManualSalary(salary.value, overtime.value.totalMinutes, params);
    const at = nowIso();
    const record = withTotals({
      ...(existing ?? newRecord(state, at)),
      basicSalaryPaise: r.monthlySalaryPaise,
      salaryDivisor: params.salaryDivisorDays,
      standardDailyHours: params.standardWorkingHours,
      overtimeMultiplier: params.overtimeMultiplier,
      workingMinutes: input.workingHours * 60 + input.workingMinutes,
      overtimeInput: input.overtime,
      overtimeMinutes: r.overtimeMinutes,
      dailySalaryExact: r.dailySalaryExact,
      hourlySalaryExact: r.hourlySalaryExact,
      dailySalaryPaise: r.dailySalaryPaise,
      hourlySalaryPaise: r.hourlySalaryPaise,
      overtimeEarningsPaise: r.overtimePaymentPaise,
      totalEarningsPaise: r.totalPaise,
      grossSalaryPaise: r.totalPaise,
      calculatorVersion: CALCULATOR_VERSION,
      notes: input.notes,
      updatedAt: at,
    });
    await db().cycles.put(record);
    return recordView(record);
  });
}

// ── Deductions (DRAFT only) ──────────────────────────────────────────────────

function deductionFields(raw: unknown) {
  const input = deductionInputSchema.parse(raw);
  return { category: input.category, amountPaise: rupeesToPaise(input.amount), description: input.description, deductionDate: input.deductionDate };
}

async function changeDeductions(key: string, change: (items: DeductionItem[], at: string) => DeductionItem[]): Promise<CycleRecordView> {
  return db().transaction("rw", db().cycles, async () => {
    const rec = await db().cycles.get(key);
    if (!rec) throw AppError.badRequest("Save this salary month first.");
    draftOnly(rec);
    const at = nowIso();
    const next = withTotals({ ...rec, deductionItems: change(rec.deductionItems, at), updatedAt: at });
    await db().cycles.put(next);
    return recordView(next);
  });
}

export async function addDeduction(key: string, raw: unknown): Promise<CycleRecordView> {
  const f = deductionFields(raw);
  return changeDeductions(key, (items, at) => [...items, { id: newId(), ...f, createdAt: at, updatedAt: at }]);
}

export async function updateDeduction(key: string, id: string, raw: unknown): Promise<CycleRecordView> {
  const f = deductionFields(raw);
  return changeDeductions(key, (items, at) => {
    if (!items.some((d) => d.id === id)) throw AppError.notFound("Deduction not found.");
    return items.map((d) => (d.id === id ? { ...d, ...f, updatedAt: at } : d));
  });
}

export async function removeDeduction(key: string, id: string): Promise<CycleRecordView> {
  return changeDeductions(key, (items) => {
    if (!items.some((d) => d.id === id)) throw AppError.notFound("Deduction not found.");
    return items.filter((d) => d.id !== id);
  });
}

// ── Finalize / reopen ────────────────────────────────────────────────────────

/**
 * Locks the month: recalculates everything from the saved inputs, stores an
 * immutable snapshot and sets FINALIZED. Does NOT touch the balance.
 */
export async function finalizeCycle(key: string): Promise<CycleRecordView> {
  await getCycleState(key); // validates the month
  return db().transaction("rw", db().cycles, async () => {
    const rec = await db().cycles.get(key);
    if (!rec) throw AppError.badRequest("Save this salary month first.");
    if (rec.status !== "draft") return recordView(rec); // already finalized: nothing to do
    if (rec.basicSalaryPaise <= 0) throw AppError.badRequest("Enter the basic salary before finalizing.", "basicSalary");
    const params = recordView(rec).params;
    const r = calculateManualSalary(rec.basicSalaryPaise, rec.overtimeMinutes, params);
    const at = nowIso();
    const totals = withTotals({ ...rec, grossSalaryPaise: r.totalPaise, totalEarningsPaise: r.totalPaise, overtimeEarningsPaise: r.overtimePaymentPaise });
    if (totals.finalSalaryPayablePaise <= 0) throw AppError.badRequest("The final salary payable must be more than ₹0.");
    const snapshot: SalarySnapshot = {
      finalizedAt: at,
      basicSalaryPaise: rec.basicSalaryPaise,
      salaryDivisor: rec.salaryDivisor,
      standardDailyHours: rec.standardDailyHours,
      overtimeMultiplier: rec.overtimeMultiplier,
      workingMinutes: rec.workingMinutes,
      overtimeInput: rec.overtimeInput,
      overtimeMinutes: rec.overtimeMinutes,
      hourlySalaryExact: r.hourlySalaryExact,
      overtimeEarningsPaise: r.overtimePaymentPaise,
      grossSalaryPaise: totals.grossSalaryPaise,
      deductionItems: structuredClone(rec.deductionItems),
      totalDeductionsPaise: totals.totalDeductionsPaise,
      finalSalaryPayablePaise: totals.finalSalaryPayablePaise,
      reopenedAt: null,
      reopenReason: "",
    };
    const next: CycleRecord = { ...totals, status: "finalized", finalizedAt: at, finalizations: [...rec.finalizations, snapshot], updatedAt: at };
    await db().cycles.put(next);
    return recordView(next);
  });
}

/** Unlocks a FINALIZED (not received) month for corrections. Its snapshot stays in the history. */
export async function reopenCycle(key: string, raw: unknown): Promise<CycleRecordView> {
  const { reason } = reopenSchema.parse(raw);
  return db().transaction("rw", db().cycles, async () => {
    const rec = await db().cycles.get(key);
    if (!rec) throw AppError.notFound("Salary month not found.");
    if (rec.status === "received") throw AppError.conflict("This salary is already received. Undo “received” first.");
    if (rec.status !== "finalized") throw AppError.conflict("This salary is not finalized.");
    const at = nowIso();
    const finalizations = rec.finalizations.map((s, i) => (i === rec.finalizations.length - 1 && !s.reopenedAt ? { ...s, reopenedAt: at, reopenReason: reason } : s));
    const next: CycleRecord = { ...rec, status: "draft", finalizedAt: null, finalizations, updatedAt: at };
    await db().cycles.put(next);
    return recordView(next);
  });
}

// ── Received ─────────────────────────────────────────────────────────────────

/**
 * Marks a FINALIZED month as received: ONE ledger credit of exactly the final
 * salary payable (sourceKey "salary:<month>"). Doing it again never credits twice.
 */
export async function receiveSalary(key: string, raw: unknown): Promise<CycleRecordView> {
  const input = receiveSalarySchema.parse(raw);
  const state = await getCycleState(key);
  assertNotFuture(input.receivedOn, todayKey(state.settings.timezone), "Received date");
  return db().transaction("rw", db().cycles, db().ledger, async () => {
    const rec = await db().cycles.get(key);
    if (!rec) throw AppError.badRequest("Save and finalize this salary first.");
    if (rec.status === "received") return recordView(rec); // already credited
    if (rec.status !== "finalized") throw AppError.conflict("Finalize the salary before marking it as received.");
    const amount = rec.finalSalaryPayablePaise;
    const { entry } = await insertEntry({ direction: "in", kind: "salary", category: "salary", amountPaise: amount, date: input.receivedOn, description: `${rec.label} salary`, salaryCycleKey: key, sourceKey: `salary:${key}` });
    const at = nowIso();
    const next: CycleRecord = {
      ...rec,
      status: "received",
      received: true,
      receivedOn: entry.date,
      receivedAt: at,
      receivedAmountPaise: entry.amountPaise,
      receivedLedgerTransactionId: entry.id,
      ledgerEntryId: entry.id,
      updatedAt: at,
    };
    await db().cycles.put(next);
    return recordView(next);
  });
}

/** Undoes "received": the credit is reversed (kept in history); the month goes back to FINALIZED. */
export async function undoReceived(key: string, reason: string): Promise<CycleRecordView> {
  return db().transaction("rw", db().cycles, db().ledger, async () => {
    const rec = await db().cycles.get(key);
    if (rec?.status !== "received") throw AppError.conflict("This salary is not marked as received.");
    const credit = await db().ledger.where("sourceKey").equals(`salary:${key}`).first();
    if (credit) await markReversed(credit.id, reason || "Salary receipt undone");
    const next: CycleRecord = { ...rec, status: "finalized", received: false, receivedOn: null, receivedAt: null, receivedAmountPaise: null, receivedLedgerTransactionId: null, ledgerEntryId: null, updatedAt: nowIso() };
    await db().cycles.put(next);
    return recordView(next);
  });
}
