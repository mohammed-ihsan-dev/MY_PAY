import "fake-indexeddb/auto";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { db, resetDbInstance } from "@/data/db";
import { ensureSettings } from "@/data/settings";
import { addDeduction, finalizeCycle, getCycleState, receiveSalary, saveCycle } from "@/data/cycles";
import { addManualEntry, availableBalance } from "@/data/ledger";
import { createDebt, listDebts, recordPayment } from "@/data/debts";
import { backupStatus, exportBackup, mergeBackup, parseBackupText, previewMerge, resetAllData, restoreBackup, undoLastRestore, type Backup } from "@/data/backup";

const TODAY = "2026-11-11";
const balance = async () => (await availableBalance()).balancePaise;
const roundTrip = async (): Promise<Backup> => parseBackupText(JSON.stringify(await exportBackup()));

async function seed() {
  await saveCycle("2026-10", { basicSalary: "17000", overtime: "3.21", workingHours: 0, workingMinutes: 0 });
  await addDeduction("2026-10", { category: "late_fine", amount: 400, description: "3 late days", deductionDate: "" });
  await finalizeCycle("2026-10");
  await receiveSalary("2026-10", { receivedOn: "2026-11-10" });
  const debt = await createDebt({ name: "Loan", lender: "Friend", originalAmount: 5000, borrowedOn: "2026-10-01" });
  await recordPayment(debt.id, { amount: 1000, paymentDate: TODAY, notes: "" });
  await addManualEntry({ type: "expense", category: "food", amount: 250, date: TODAY, description: "Lunch" });
  return debt.id;
}

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

describe("export contains everything", () => {
  test("deductions, finalized snapshots, received credit, debts, repayments and transactions survive a full restore with IDs intact", async () => {
    await seed();
    const b = await roundTrip();
    const ids = { cycles: b.data.cycles.map((c) => c.receivedLedgerTransactionId), ledger: b.data.ledger.map((e) => e.id).sort(), payments: b.data.payments.map((p) => p.id) };
    expect(b.data.cycles[0]).toMatchObject({ status: "received", totalDeductionsPaise: 40_000, finalSalaryPayablePaise: 1_685_311, finalizations: [{ finalSalaryPayablePaise: 1_685_311 }] });
    await resetAllData();
    await restoreBackup(b);
    const again = await exportBackup();
    expect(again.data.cycles.map((c) => c.receivedLedgerTransactionId)).toEqual(ids.cycles);
    expect(again.data.ledger.map((e) => e.id).sort()).toEqual(ids.ledger);
    expect(again.data.payments.map((p) => p.id)).toEqual(ids.payments);
    expect(await balance()).toBe(1_685_311 - 100_000 - 25_000);
    expect((await getCycleState("2026-10")).record?.deductionItems).toHaveLength(1);
  });
});

describe("merge restore", () => {
  test("into an empty phone: same result as a full restore", async () => {
    await seed();
    const b = await roundTrip();
    const expected = await balance();
    await resetAllData();
    await ensureSettings();
    const plan = await mergeBackup(b);
    expect(plan.counts.transactions.added).toBe(3);
    expect(await balance()).toBe(expected);
    expect((await listDebts())[0].remainingPaise).toBe(400_000);
  });

  test("merging the same backup again adds nothing and never doubles money", async () => {
    await seed();
    const b = await roundTrip();
    const before = await balance();
    const plan = await mergeBackup(b);
    expect(plan.nothingToAdd).toBe(true);
    expect(plan.counts.transactions).toMatchObject({ added: 0, alreadyHere: 3 });
    await mergeBackup(b);
    expect(await balance()).toBe(before);
    expect(await db().ledger.count()).toBe(3);
  });

  test("adds records made on the other phone (new expense + new repayment on a shared debt) and recalculates the debt", async () => {
    const debtId = await seed();
    const shared = await roundTrip(); // both phones start from this
    // "Other phone": add a repayment and an expense, then back it up.
    await recordPayment(debtId, { amount: 500, paymentDate: TODAY, notes: "other phone" });
    await addManualEntry({ type: "expense", category: "transportation", amount: 80, date: TODAY, description: "Bus" });
    const other = await roundTrip();
    // "This phone": back to the shared state, plus its own expense.
    await restoreBackup(shared, { allowRepeat: true });
    await addManualEntry({ type: "expense", category: "food", amount: 120, date: TODAY, description: "Tea" });

    const preview = await previewMerge(other);
    expect(preview.counts.payments.added).toBe(1);
    expect(preview.counts.transactions.added).toBe(2);
    expect(await db().ledger.count()).toBe(4); // preview changes nothing

    await mergeBackup(other);
    expect(await balance()).toBe(1_685_311 - 100_000 - 25_000 - 12_000 - 50_000 - 8_000);
    const [debt] = await listDebts();
    expect(debt).toMatchObject({ remainingPaise: 350_000 });
    expect(debt.payments).toHaveLength(2);
    // Every repayment transaction still points at its repayment record.
    const payments = new Set((await db().payments.toArray()).map((p) => p.id));
    for (const e of await db().ledger.where("kind").equals("debt_repayment").toArray()) expect(payments.has(e.debtPaymentId!)).toBe(true);
  });

  test("conflicting salary month: this phone's version is kept and the salary is not credited twice", async () => {
    await seed();
    const b = await roundTrip();
    // This phone: same month, but un-received and with a different deduction.
    await restoreBackup(structuredClone(b), { allowRepeat: true });
    const tx = await db().ledger.where("kind").equals("salary").first();
    await import("@/data/cycles").then((m) => m.undoReceived("2026-10", "test"));
    await import("@/data/cycles").then((m) => m.reopenCycle("2026-10", { reason: "fix fine" }));
    await addDeduction("2026-10", { category: "half_day_fine", amount: 500, description: "", deductionDate: "" });
    const before = await balance();

    const plan = await mergeBackup(b);
    expect(plan.counts.cycles.conflicts).toBe(1);
    expect(plan.conflicts.join(" ")).toMatch(/October 2026/);
    expect(await balance()).toBe(before);
    expect((await getCycleState("2026-10")).record?.status).toBe("draft");
    expect((await db().ledger.get(tx!.id))?.status).toBe("reversed"); // not silently overwritten
  });

  test("a salary credit with another ID for an already-credited month is a duplicate", async () => {
    await seed();
    const b = await roundTrip();
    const dup = structuredClone(b);
    const credit = dup.data.ledger.find((e) => e.kind === "salary")!;
    credit.id = "another-phone-credit";
    dup.data.cycles = []; // the month is only in this phone's data
    dup.backupId = "dup";
    const plan = await mergeBackup(dup);
    expect(plan.counts.transactions.duplicates).toBe(1);
    expect(await db().ledger.where("kind").equals("salary").count()).toBe(1);
  });

  test("a merge can be undone", async () => {
    await seed();
    const b = await roundTrip();
    await resetAllData();
    await ensureSettings();
    await addManualEntry({ type: "income", category: "gift", amount: 100, date: TODAY, description: "mine" });
    const before = await balance();
    await mergeBackup(b);
    expect(await balance()).not.toBe(before);
    expect((await backupStatus()).canUndoRestore).toBe(true);
    await undoLastRestore();
    expect(await balance()).toBe(before);
  });
});
