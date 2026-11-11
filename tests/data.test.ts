import "fake-indexeddb/auto";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { db, resetDbInstance } from "@/data/db";
import { ensureSettings, getSettings, updateSettings } from "@/data/settings";
import { finalizeCycle, getCycleState, receiveSalary, reopenCycle, saveCycle, undoReceived } from "@/data/cycles";
import { addManualEntry, availableBalance, correctManualEntry, listEntries, periodSummary } from "@/data/ledger";
import { createDebt, listDebts, recordPayment, reversePayment, summarizeDebts } from "@/data/debts";
import { reverseEntry } from "@/data/reverse";
import { getDashboard } from "@/data/dashboard";
import { cycleByKey } from "@/lib/salary-cycle";

const TODAY = "2026-11-11";
const balance = async () => (await availableBalance()).balancePaise;
const expense = (amount: number, date = TODAY, extra: Record<string, unknown> = {}) =>
  addManualEntry({ type: "expense", category: "food", amount, date, description: "Food", ...extra });
const income = (amount: number, date = TODAY, extra: Record<string, unknown> = {}) =>
  addManualEntry({ type: "income", category: "freelance", amount, date, description: "Side work", ...extra });
const save = (key: string, basicSalary = "17000", overtime = "", extra: Record<string, unknown> = {}) =>
  saveCycle(key, { basicSalary, overtime, workingHours: 175, workingMinutes: 30, notes: "", ...extra });
const finalizeAndReceive = async (key: string, input: { receivedOn: string }) => {
  await finalizeCycle(key);
  return receiveSalary(key, input);
};
const settingsInput = (over: Record<string, unknown> = {}) => ({ monthlyBasicSalary: 17000, salaryDivisor: 30, standardDailyHours: 7.5, overtimeMultiplier: 1, paydayDay: 10, timezone: "Asia/Kolkata", ...over });

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-11T06:00:00Z")); // 11:30 IST, 11 Nov 2026
});
afterAll(() => vi.useRealTimers());
beforeEach(async () => {
  await db().delete();
  await resetDbInstance();
  await ensureSettings();
});

describe("settings", () => {
  test("defaults: ₹17,000, ÷30, 7.5 h, ×1, paid on the 10th, INR, Asia/Kolkata", async () => {
    expect(await getSettings()).toMatchObject({ monthlyBasicSalaryPaise: 1_700_000, salaryDivisor: 30, standardDailyHours: 7.5, overtimeMultiplier: 1, paydayDay: 10, currency: "INR", timezone: "Asia/Kolkata" });
  });

  test("current month on 11 Nov 2026 is November (1–30 Nov, paid 10 Dec); October is pending", async () => {
    const s = await getCycleState();
    expect(s.cycle).toMatchObject({ key: "2026-11", startDate: "2026-11-01", endDate: "2026-12-01", payDate: "2026-12-10" });
    await expect(getCycleState("2026-12")).rejects.toThrow(/not started/);
    const d = await getDashboard();
    expect(d.pendingPrevious?.state.cycle).toMatchObject({ key: "2026-10", payDate: "2026-11-10" });
  });
});

describe("persistence", () => {
  test("records survive closing and reopening the database (refresh / app restart)", async () => {
    await save("2026-10");
    await finalizeAndReceive("2026-10", { receivedOn: "2026-11-10" });
    await createDebt({ name: "Loan", lender: "Friend", originalAmount: 5000, borrowedOn: "2026-10-01" });
    await expense(250);
    await resetDbInstance(); // like closing the app
    expect(await balance()).toBe(1_700_000 - 25_000);
    expect((await listDebts())[0]).toMatchObject({ name: "Loan", remainingPaise: 500_000 });
    expect((await getCycleState("2026-10")).record).toMatchObject({ received: true });
  });
});

describe("salary", () => {
  test("₹17,000 + 3.21 overtime → ₹253.11 OT, ₹17,253.11 total", async () => {
    const r = await save("2026-10", "17000", "3.21");
    expect(r).toMatchObject({ overtimeMinutes: 201, overtimeEarningsPaise: 25_311, totalEarningsPaise: 1_725_311, workingMinutes: 175 * 60 + 30, received: false });
  });

  test("invalid overtime (3.75) is refused", async () => {
    await expect(save("2026-10", "17000", "3.75")).rejects.toThrow(/00 and 59/);
  });

  test("a preview is not money: nothing is added until marked received", async () => {
    await save("2026-10", "17000", "3.21");
    expect(await balance()).toBe(0);
  });

  test("marking received twice (even at the same moment) credits the salary once", async () => {
    await save("2026-10", "17000", "3.21");
    await finalizeCycle("2026-10");
    await Promise.allSettled([receiveSalary("2026-10", { receivedOn: "2026-11-10" }), receiveSalary("2026-10", { receivedOn: "2026-11-10" })]);
    await finalizeAndReceive("2026-10", { receivedOn: "2026-11-10" });
    const credits = await db().ledger.where("kind").equals("salary").toArray();
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ amountPaise: 1_725_311, salaryCycleKey: "2026-10", sourceKey: "salary:2026-10" });
    expect(await balance()).toBe(1_725_311);
  });

  test("received salary is locked; undo reverses the credit (kept) and it can be received again once", async () => {
    await save("2026-10");
    await finalizeAndReceive("2026-10", { receivedOn: "2026-11-10" });
    await expect(save("2026-10", "18000")).rejects.toThrow(/received and locked/);
    await undoReceived("2026-10", "wrong amount");
    expect(await balance()).toBe(0);
    expect((await getCycleState("2026-10")).record?.status).toBe("finalized");
    await reopenCycle("2026-10", { reason: "basic salary changed" });
    await save("2026-10", "17500");
    await finalizeAndReceive("2026-10", { receivedOn: "2026-11-10" });
    expect(await balance()).toBe(1_750_000);
    const credits = await db().ledger.where("kind").equals("salary").toArray();
    expect(credits.map((c) => [c.status, c.amountPaise]).sort()).toEqual([
      ["active", 1_750_000],
      ["reversed", 1_700_000],
    ]);
  });

  test("changing the salary setting never rewrites a saved month; unsaved months use it", async () => {
    const oct = await save("2026-10", "17000", "2.00");
    await updateSettings(settingsInput({ monthlyBasicSalary: 20000, standardDailyHours: 8, overtimeMultiplier: 1.5 }));
    const after = await getCycleState("2026-10");
    expect(after.record).toMatchObject({ basicSalaryPaise: 1_700_000, totalEarningsPaise: oct.totalEarningsPaise });
    expect(after.settingsDiffer).toBe(true);
    expect((await save("2026-10", "17000", "2.00")).totalEarningsPaise).toBe(oct.totalEarningsPaise);
    expect((await save("2026-10", "17000", "2.00", { applyCurrentSettings: true })).params).toEqual({ salaryDivisorDays: 30, standardWorkingHours: 8, overtimeMultiplier: 1.5 });
    expect((await getDashboard()).salary).toMatchObject({ saved: false, basicSalaryPaise: 2_000_000 });
  });
});

describe("balance and transactions", () => {
  test("available balance = money in − money out", async () => {
    await income(2500);
    await expense(300.5);
    await expense(199.5);
    expect(await availableBalance()).toEqual({ inPaise: 250_000, outPaise: 50_000, balancePaise: 200_000 });
  });

  test("the balance carries forward and is never reset when a month starts", async () => {
    await save("2026-10");
    await finalizeAndReceive("2026-10", { receivedOn: "2026-11-10" });
    await expense(1000, "2026-10-20");
    await income(500, "2026-10-12");
    const oct = cycleByKey("2026-10");
    const nov = cycleByKey("2026-11");
    expect(await periodSummary(oct.startDate, oct.endDate)).toMatchObject({ openingBalancePaise: 0, otherIncomePaise: 50_000, expensesPaise: 100_000, closingBalancePaise: -50_000 });
    await expense(250);
    const n = await periodSummary(nov.startDate, nov.endDate);
    expect(n).toMatchObject({ openingBalancePaise: -50_000, salaryReceivedPaise: 1_700_000, expensesPaise: 25_000 });
    expect(await balance()).toBe(n.closingBalancePaise);
  });

  test("the same form submission (requestId) is saved once", async () => {
    const a = await expense(120, TODAY, { requestId: "req-abcdef123" });
    const b = await expense(120, TODAY, { requestId: "req-abcdef123" });
    expect([a.created, b.created]).toEqual([true, false]);
    expect(await db().ledger.count()).toBe(1);
  });

  test("future dates are refused", async () => {
    await expect(expense(10, "2026-11-12")).rejects.toThrow(/future/);
  });

  test("a correction keeps the original as reversed and adds the corrected entry", async () => {
    const { entry } = await expense(500);
    await correctManualEntry(entry.id, { type: "expense", category: "shopping", amount: 450, date: TODAY, description: "Shoes" });
    const all = await listEntries({ showReversed: true });
    expect(all.find((e) => e.id === entry.id)).toMatchObject({ status: "reversed", reversalReason: "Corrected" });
    expect(all.find((e) => e.id !== entry.id)).toMatchObject({ status: "active", amountPaise: 45_000, correctionOf: entry.id });
    expect(await balance()).toBe(-45_000);
  });
});

describe("debts", () => {
  const setup = async () => {
    await income(15000, "2026-11-01");
    return createDebt({ name: "Friend loan", lender: "Friend", originalAmount: 5000, borrowedOn: "2026-10-01" });
  };

  test("projected balance after clearing all debt = balance − outstanding", async () => {
    await setup();
    const d = await getDashboard();
    expect([d.balancePaise, d.debts.totalOutstandingPaise, d.balanceAfterDebtPaise]).toEqual([1_500_000, 500_000, 1_000_000]);
  });

  test("partial repayment lowers debt and balance; projection stays the same", async () => {
    const debt = await setup();
    await recordPayment(debt.id, { amount: 1000, paymentDate: TODAY, notes: "UPI" });
    const d = await getDashboard();
    expect([d.balancePaise, d.debts.totalOutstandingPaise, d.debts.totalRepaidPaise, d.balanceAfterDebtPaise]).toEqual([1_400_000, 400_000, 100_000, 1_000_000]);
  });

  test("one OUT ledger entry per repayment, never an extra expense", async () => {
    const debt = await setup();
    await recordPayment(debt.id, { amount: 1000, paymentDate: TODAY, notes: "" });
    const payment = (await db().payments.toArray())[0];
    const outs = await db().ledger.where("direction").equals("out").toArray();
    expect(outs).toHaveLength(1);
    expect(outs[0]).toMatchObject({ kind: "debt_repayment", amountPaise: 100_000, debtPaymentId: payment.id, sourceKey: `debtpay:${payment.id}` });
    expect((await db().debts.get(debt.id))?.remainingPaise).toBe(400_000);
  });

  test("full repayment marks the debt paid and keeps the history", async () => {
    const debt = await setup();
    await recordPayment(debt.id, { amount: 1000, paymentDate: "2026-11-05", notes: "" });
    await expect(recordPayment(debt.id, { amount: 4000.01, paymentDate: TODAY, notes: "" })).rejects.toThrow(/more than/);
    const { debt: paid } = await recordPayment(debt.id, { amount: 4000, paymentDate: TODAY, notes: "" });
    expect(paid).toMatchObject({ status: "paid", remainingPaise: 0, repaidPaise: 500_000 });
    expect(paid.payments).toHaveLength(2);
    await expect(recordPayment(debt.id, { amount: 1, paymentDate: TODAY, notes: "" })).rejects.toThrow(/fully repaid/);
    expect(summarizeDebts(await listDebts())).toMatchObject({ totalOutstandingPaise: 0, activeCount: 0, paidCount: 1 });
  });

  test("a double-tapped repayment (same requestId) is recorded once", async () => {
    const debt = await setup();
    const input = { amount: 1000, paymentDate: TODAY, notes: "", requestId: "pay-12345678" };
    await Promise.allSettled([recordPayment(debt.id, input), recordPayment(debt.id, input)]);
    await recordPayment(debt.id, input);
    expect(await db().payments.count()).toBe(1);
    expect(await db().ledger.where("kind").equals("debt_repayment").count()).toBe(1);
    expect(await balance()).toBe(1_400_000);
  });

  test("reversing a repayment (from Debts or History) restores debt and balance, keeping records", async () => {
    const debt = await setup();
    await recordPayment(debt.id, { amount: 1000, paymentDate: TODAY, notes: "" });
    const p = (await db().payments.toArray())[0];
    const after = await reversePayment(debt.id, p.id, "mistake");
    expect(after).toMatchObject({ remainingPaise: 500_000 });
    expect(after.payments[0]).toMatchObject({ status: "reversed", reversalReason: "mistake" });
    expect(await balance()).toBe(1_500_000);

    await recordPayment(debt.id, { amount: 2000, paymentDate: TODAY, notes: "" });
    const entry = (await db().ledger.where("kind").equals("debt_repayment").toArray()).find((e) => e.status === "active")!;
    await reverseEntry(entry.id, "");
    expect((await listDebts())[0].remainingPaise).toBe(500_000);
  });

  test("borrowed money can be added to the balance (once)", async () => {
    await createDebt({ name: "Loan", lender: "Ravi", originalAmount: 3000, borrowedOn: TODAY, addToBalance: true });
    expect(await balance()).toBe(300_000);
  });
});
