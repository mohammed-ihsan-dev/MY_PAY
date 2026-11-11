import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { DB_NAME, db, resetDbInstance } from "@/data/db";
import { ensureSettings } from "@/data/settings";
import { addDeduction, finalizeCycle, getCycleState, receiveSalary, removeDeduction, reopenCycle, saveCycle, undoReceived, updateDeduction } from "@/data/cycles";
import { availableBalance, listEntries } from "@/data/ledger";
import { getDashboard } from "@/data/dashboard";
import { exportBackup, parseBackupText } from "@/data/backup";
import { finalPayable } from "@/lib/salary-calculator";

const KEY = "2026-10";
const RECEIVED_ON = "2026-11-10";
const balance = async () => (await availableBalance()).balancePaise;
const record = async () => (await getCycleState(KEY)).record!;
const save = (overtime = "3.21", basicSalary = "17000") => saveCycle(KEY, { basicSalary, overtime, workingHours: 175, workingMinutes: 30 });
const fine = (category: string, amount: number | string, extra: Record<string, unknown> = {}) => addDeduction(KEY, { category, amount, ...extra });

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-11T06:00:00Z"));
});
afterAll(() => vi.useRealTimers());
beforeEach(async () => {
  await db().delete();
  await resetDbInstance();
  await ensureSettings();
});

describe("final salary payable (pure calculation)", () => {
  test("gross − deductions; a negative result is flagged, never returned silently", () => {
    expect(finalPayable(1_725_311, [])).toMatchObject({ totalDeductionsPaise: 0, finalSalaryPayablePaise: 1_725_311, error: null });
    expect(finalPayable(1_725_311, [{ amountPaise: 40_000 }, { amountPaise: 50_000 }])).toMatchObject({ totalDeductionsPaise: 90_000, finalSalaryPayablePaise: 1_635_311, error: null });
    expect(finalPayable(10_000, [{ amountPaise: 10_001 }]).error).toMatch(/cannot be negative/);
    expect(() => finalPayable(10_000, [{ amountPaise: -5 }])).toThrow();
  });
});

describe("salary deductions", () => {
  test("1. no deductions: final payable = gross", async () => {
    const r = await save();
    expect(r).toMatchObject({ grossSalaryPaise: 1_725_311, totalDeductionsPaise: 0, finalSalaryPayablePaise: 1_725_311, status: "draft" });
  });

  test("2. one late fine", async () => {
    await save();
    const r = await fine("late_fine", 400, { description: "3 late days", deductionDate: "2026-10-15" });
    expect(r.deductionItems).toHaveLength(1);
    expect(r.deductionItems[0]).toMatchObject({ category: "late_fine", amountPaise: 40_000, description: "3 late days", deductionDate: "2026-10-15" });
    expect(r).toMatchObject({ totalDeductionsPaise: 40_000, finalSalaryPayablePaise: 1_685_311 });
  });

  test("3. multiple deductions (spec example: ₹17,253.11 − ₹900 = ₹16,353.11)", async () => {
    await save();
    await fine("late_fine", 400);
    const r = await fine("half_day_fine", 500);
    expect(r).toMatchObject({ grossSalaryPaise: 1_725_311, totalDeductionsPaise: 90_000, finalSalaryPayablePaise: 1_635_311 });
    const r3 = await fine("other_fine", 100);
    expect(r3.totalDeductionsPaise).toBe(100_000);
  });

  test("4. editing a deduction recalculates", async () => {
    await save();
    const { deductionItems } = await fine("late_fine", 400);
    const r = await updateDeduction(KEY, deductionItems[0].id, { category: "attendance_fine", amount: 250, description: "corrected" });
    expect(r.deductionItems[0]).toMatchObject({ category: "attendance_fine", amountPaise: 25_000, description: "corrected" });
    expect(r.finalSalaryPayablePaise).toBe(1_725_311 - 25_000);
  });

  test("5. removing a deduction recalculates", async () => {
    await save();
    await fine("late_fine", 400);
    const { deductionItems } = await fine("half_day_fine", 500);
    const r = await removeDeduction(KEY, deductionItems[0].id);
    expect(r.deductionItems.map((d) => d.category)).toEqual(["half_day_fine"]);
    expect(r.finalSalaryPayablePaise).toBe(1_725_311 - 50_000);
  });

  test("6. changing the overtime keeps deductions and recalculates the final payable", async () => {
    await save();
    await fine("late_fine", 400);
    const r = await save("0");
    expect(r).toMatchObject({ grossSalaryPaise: 1_700_000, totalDeductionsPaise: 40_000, finalSalaryPayablePaise: 1_660_000 });
  });

  test("12. negative, zero, invalid or too-large deductions are rejected", async () => {
    await save("0", "1000");
    await expect(fine("late_fine", -50)).rejects.toThrow();
    await expect(fine("late_fine", 0)).rejects.toThrow();
    await expect(fine("late_fine", "abc")).rejects.toThrow();
    await expect(fine("late_fine", 10.005)).rejects.toThrow(/2 decimal/);
    await expect(fine("parking", 10)).rejects.toThrow();
    await expect(fine("late_fine", 1000.01)).rejects.toThrow(/cannot be negative/);
    await fine("late_fine", 600);
    await expect(save("0", "500")).rejects.toThrow(/cannot be negative/); // lowering the salary below the fines
    expect((await record()).deductionItems).toHaveLength(1);
  });

  test("deductions are never ledger expenses and never touch the balance before receipt", async () => {
    await save();
    await fine("late_fine", 400);
    await finalizeCycle(KEY);
    expect(await listEntries({ showReversed: true })).toHaveLength(0);
    expect(await balance()).toBe(0);
  });
});

describe("finalize and mark as received", () => {
  test("7. finalizing stores a snapshot, locks the month, and credits nothing", async () => {
    await save();
    await fine("late_fine", 400);
    await fine("half_day_fine", 500);
    const r = await finalizeCycle(KEY);
    expect(r).toMatchObject({ status: "finalized", finalizedAt: "2026-11-11T06:00:00.000Z", finalSalaryPayablePaise: 1_635_311 });
    expect(r.finalizations).toHaveLength(1);
    expect(r.finalizations[0]).toMatchObject({ grossSalaryPaise: 1_725_311, totalDeductionsPaise: 90_000, finalSalaryPayablePaise: 1_635_311, reopenedAt: null });
    expect(r.finalizations[0].deductionItems).toHaveLength(2);
    expect(await balance()).toBe(0);
    await expect(fine("other_fine", 1)).rejects.toThrow(/finalized and locked/);
    await expect(save("5.00")).rejects.toThrow(/finalized and locked/);
    await expect(removeDeduction(KEY, r.deductionItems[0].id)).rejects.toThrow(/finalized and locked/);
  });

  test("cannot mark as received before finalizing", async () => {
    await save();
    await expect(receiveSalary(KEY, { receivedOn: RECEIVED_ON })).rejects.toThrow(/Finalize the salary/);
    expect(await balance()).toBe(0);
  });

  test("8. marking received credits ONLY the final payable (₹16,353.11, not the gross)", async () => {
    await save();
    await fine("late_fine", 400);
    await fine("half_day_fine", 500);
    await finalizeCycle(KEY);
    const r = await receiveSalary(KEY, { receivedOn: RECEIVED_ON });
    expect(r).toMatchObject({ status: "received", received: true, receivedOn: RECEIVED_ON, receivedAt: "2026-11-11T06:00:00.000Z", receivedAmountPaise: 1_635_311 });
    const credits = await listEntries({ showReversed: true });
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ kind: "salary", direction: "in", amountPaise: 1_635_311, salaryCycleKey: KEY });
    expect(r).toMatchObject({ received: true });
    expect((await db().cycles.get(KEY))?.receivedLedgerTransactionId).toBe(credits[0].id);
    expect(await balance()).toBe(1_635_311);
    expect((await getDashboard()).balancePaise).toBe(1_635_311);
  });

  test("9. marking received twice (even at the same moment) never credits twice", async () => {
    await save();
    await finalizeCycle(KEY);
    await Promise.allSettled([receiveSalary(KEY, { receivedOn: RECEIVED_ON }), receiveSalary(KEY, { receivedOn: RECEIVED_ON })]);
    await receiveSalary(KEY, { receivedOn: RECEIVED_ON });
    expect(await db().ledger.where("kind").equals("salary").count()).toBe(1);
    expect(await balance()).toBe(1_725_311);
  });

  test("10. reopening the app keeps the salary, deductions and RECEIVED status", async () => {
    await save();
    await fine("late_fine", 400);
    await finalizeCycle(KEY);
    await receiveSalary(KEY, { receivedOn: RECEIVED_ON });
    await resetDbInstance(); // like refreshing / restarting the app
    const r = await record();
    expect(r).toMatchObject({ status: "received", finalSalaryPayablePaise: 1_685_311, totalDeductionsPaise: 40_000 });
    expect(r.deductionItems).toHaveLength(1);
    await receiveSalary(KEY, { receivedOn: RECEIVED_ON });
    expect(await balance()).toBe(1_685_311);
  });

  test("11. reopening keeps the earlier finalized calculation in the history", async () => {
    await save();
    await fine("late_fine", 400);
    await finalizeCycle(KEY);
    await expect(reopenCycle(KEY, { reason: "" })).rejects.toThrow(/why/);
    vi.setSystemTime(new Date("2026-11-11T07:00:00Z"));
    const reopened = await reopenCycle(KEY, { reason: "late fine was wrong" });
    expect(reopened).toMatchObject({ status: "draft", finalizedAt: null });
    await updateDeduction(KEY, reopened.deductionItems[0].id, { category: "late_fine", amount: 200 });
    const again = await finalizeCycle(KEY);
    expect(again.finalizations).toHaveLength(2);
    expect(again.finalizations[0]).toMatchObject({ finalSalaryPayablePaise: 1_685_311, reopenedAt: "2026-11-11T07:00:00.000Z", reopenReason: "late fine was wrong" });
    expect(again.finalizations[0].deductionItems[0].amountPaise).toBe(40_000); // the old snapshot is unchanged
    expect(again.finalizations[1]).toMatchObject({ finalSalaryPayablePaise: 1_705_311, reopenedAt: null });
    vi.setSystemTime(new Date("2026-11-11T06:00:00Z"));
  });

  test("a received salary must be un-received before it can be reopened; undo returns it to FINALIZED", async () => {
    await save();
    await finalizeCycle(KEY);
    await receiveSalary(KEY, { receivedOn: RECEIVED_ON });
    await expect(reopenCycle(KEY, { reason: "x" })).rejects.toThrow(/Undo/);
    const undone = await undoReceived(KEY, "test");
    expect(undone.status).toBe("finalized");
    expect(await balance()).toBe(0);
    expect(await db().ledger.where("status").equals("reversed").count()).toBe(1);
  });

  test("backups carry deductions, status and snapshots", async () => {
    await save();
    await fine("late_fine", 400);
    await finalizeCycle(KEY);
    const b = parseBackupText(JSON.stringify(await exportBackup()));
    expect(b.schemaVersion).toBe(2);
    expect(b.data.cycles[0]).toMatchObject({ status: "finalized", totalDeductionsPaise: 40_000, finalSalaryPayablePaise: 1_685_311 });
    expect(b.data.cycles[0].finalizations).toHaveLength(1);
  });
});

describe("upgrading data saved before deductions existed", () => {
  const v1Cycle = (over: Record<string, unknown> = {}) => ({
    cycleKey: "2026-09", label: "September 2026", startDate: "2026-09-01", endDate: "2026-10-01", payDate: "2026-10-10",
    basicSalaryPaise: 1_700_000, salaryDivisor: 30, standardDailyHours: 7.5, overtimeMultiplier: 1, workingMinutes: 0, overtimeInput: "", overtimeMinutes: 0,
    dailySalaryExact: "56666.67", hourlySalaryExact: "7555.56", dailySalaryPaise: 56_667, hourlySalaryPaise: 7_556, overtimeEarningsPaise: 0, totalEarningsPaise: 1_700_000,
    calculatorVersion: 1, notes: "", received: false, receivedOn: null, receivedAmountPaise: null, ledgerEntryId: null,
    createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z", ...over,
  });

  test("the IndexedDB upgrade (v1 → v2) turns old months into DRAFT / RECEIVED correctly", async () => {
    await db().delete();
    await resetDbInstance();
    const old = new Dexie(DB_NAME);
    old.version(1).stores({ settings: "id", cycles: "cycleKey, received", debts: "id, status, borrowedOn", payments: "id, debtId, paymentDate, status, &requestId", ledger: "id, date, kind, status, direction, category, debtId, debtPaymentId, &sourceKey, [status+direction]", preferences: "key", backupMeta: "key" });
    await old.table("cycles").bulkAdd([v1Cycle(), v1Cycle({ cycleKey: "2026-08", label: "August 2026", received: true, receivedOn: "2026-09-10", receivedAmountPaise: 1_650_000, ledgerEntryId: "L1" })]);
    old.close();

    const draft = (await db().cycles.get("2026-09"))!;
    expect(draft).toMatchObject({ status: "draft", deductionItems: [], totalDeductionsPaise: 0, grossSalaryPaise: 1_700_000, finalSalaryPayablePaise: 1_700_000, finalizations: [] });
    const recv = (await db().cycles.get("2026-08"))!;
    expect(recv).toMatchObject({ status: "received", grossSalaryPaise: 1_700_000, totalDeductionsPaise: 50_000, finalSalaryPayablePaise: 1_650_000, receivedLedgerTransactionId: "L1" });
    expect(recv.finalizations).toHaveLength(1);
  });

  test("a version-1 backup file is upgraded the same way when restored", () => {
    const v1 = {
      format: "my-pay-backup", schemaVersion: 1, backupId: "old-backup-1", createdAt: "2026-11-01T00:00:00.000Z",
      data: { settings: [], cycles: [v1Cycle()], debts: [], payments: [], ledger: [], preferences: [] },
    };
    const b = parseBackupText(JSON.stringify(v1));
    expect(b.data.cycles[0]).toMatchObject({ status: "draft", finalSalaryPayablePaise: 1_700_000, deductionItems: [] });
  });
});
