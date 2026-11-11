import "fake-indexeddb/auto";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { db, resetDbInstance } from "@/data/db";
import { ensureSettings, updateSettings } from "@/data/settings";
import { finalizeCycle, receiveSalary, saveCycle } from "@/data/cycles";
import { addManualEntry, availableBalance } from "@/data/ledger";
import { createDebt, listDebts, recordPayment } from "@/data/debts";
import { backupStatus, exportBackup, markExported, parseBackupText, resetAllData, restoreBackup, summarizeBackup, undoLastRestore } from "@/data/backup";
import { changePin, isDefaultPin, pinWaitSeconds, verifyPin } from "@/data/pin";

const TODAY = "2026-11-11";
const balance = async () => (await availableBalance()).balancePaise;

async function seed() {
  await saveCycle("2026-10", { basicSalary: "17000", overtime: "3.21", workingHours: 0, workingMinutes: 0 });
  await finalizeCycle("2026-10");
  await receiveSalary("2026-10", { receivedOn: "2026-11-10" });
  const debt = await createDebt({ name: "Loan", lender: "Friend", originalAmount: 5000, borrowedOn: "2026-10-01" });
  await recordPayment(debt.id, { amount: 1000, paymentDate: TODAY, notes: "" });
  await addManualEntry({ type: "expense", category: "food", amount: 250, date: TODAY, description: "Lunch" });
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

describe("backup export", () => {
  test("contains every store, a schema version and a timestamp, and round-trips through JSON", async () => {
    await seed();
    const b = await exportBackup();
    expect(b).toMatchObject({ format: "my-pay-backup", schemaVersion: 2, createdAt: "2026-11-11T06:00:00.000Z" });
    expect([b.data.settings.length, b.data.cycles.length, b.data.debts.length, b.data.payments.length, b.data.ledger.length]).toEqual([1, 1, 1, 1, 3]);
    const parsed = parseBackupText(JSON.stringify(b));
    const s = await summarizeBackup(parsed);
    expect(s).toMatchObject({ balancePaise: 1_725_311 - 100_000 - 25_000, outstandingDebtPaise: 400_000, counts: { transactions: 3 } });
  });

  test("never includes the PIN", async () => {
    await changePin("1627", "4321");
    const b = await exportBackup();
    expect(JSON.stringify(b)).not.toContain("pinHash");
  });

  test("backup status: reminder until a backup is made, then the last backup date", async () => {
    await seed();
    expect((await backupStatus()).reminder).toBe(true);
    await markExported(await exportBackup());
    expect(await backupStatus()).toMatchObject({ reminder: false, daysSinceExport: 0, lastExportAt: "2026-11-11T06:00:00.000Z" });
    expect((await backupStatus(new Date("2026-11-20T06:00:00Z"))).reminder).toBe(true);
  });
});

describe("backup import", () => {
  test("restores everything onto a new / empty device", async () => {
    await seed();
    const text = JSON.stringify(await exportBackup());
    const expected = await balance();
    await resetAllData();
    expect(await balance()).toBe(0);
    await restoreBackup(parseBackupText(text));
    expect(await balance()).toBe(expected);
    expect((await listDebts())[0]).toMatchObject({ remainingPaise: 400_000, payments: [{ status: "paid" }] });
    // Unique keys still work after a restore: the salary cannot be credited twice.
    await receiveSalary("2026-10", { receivedOn: "2026-11-10" });
    expect(await balance()).toBe(expected);
  });

  test("restoring the same backup twice is refused (duplicate import)", async () => {
    await seed();
    const b = parseBackupText(JSON.stringify(await exportBackup()));
    await restoreBackup(b);
    await expect(restoreBackup(b)).rejects.toThrow(/already restored/);
    expect((await summarizeBackup(b)).alreadyRestoredAt).toBeTruthy();
    await restoreBackup(b, { allowRepeat: true }); // only when explicitly confirmed
    expect(await db().ledger.count()).toBe(3); // replaced, never doubled
  });

  test("a restore never silently loses data: it can be undone", async () => {
    await seed();
    const old = parseBackupText(JSON.stringify(await exportBackup()));
    await addManualEntry({ type: "income", category: "gift", amount: 999, date: TODAY, description: "after backup" });
    const before = await balance();
    await restoreBackup(old);
    expect(await balance()).toBe(before - 99_900);
    expect((await backupStatus()).canUndoRestore).toBe(true);
    await undoLastRestore();
    expect(await balance()).toBe(before);
  });

  test("rejects invalid files with a readable reason", async () => {
    await seed();
    const good = await exportBackup();
    expect(() => parseBackupText("not json")).toThrow(/not valid JSON/);
    expect(() => parseBackupText(JSON.stringify({ hello: 1 }))).toThrow(/not a MY PAY backup/);
    expect(() => parseBackupText(JSON.stringify({ ...good, schemaVersion: 99 }))).toThrow(/newer version/);
    const badMoney = structuredClone(good);
    badMoney.data.ledger[0].amountPaise = 12.5;
    expect(() => parseBackupText(JSON.stringify(badMoney))).toThrow(/whole paise/);
    const orphan = structuredClone(good);
    orphan.data.debts = [];
    expect(() => parseBackupText(JSON.stringify(orphan))).toThrow(/debt that is not in the file/);
    const dupIds = structuredClone(good);
    dupIds.data.ledger[1].id = dupIds.data.ledger[0].id;
    expect(() => parseBackupText(JSON.stringify(dupIds))).toThrow(/duplicate transaction IDs/);
  });

  test("restoring keeps settings changes from the backup", async () => {
    await updateSettings({ monthlyBasicSalary: 18000, salaryDivisor: 30, standardDailyHours: 7.5, overtimeMultiplier: 1, paydayDay: 10, timezone: "Asia/Kolkata" });
    const b = parseBackupText(JSON.stringify(await exportBackup()));
    await resetAllData();
    await restoreBackup(b);
    expect((await db().settings.get("salary"))?.monthlyBasicSalaryPaise).toBe(1_800_000);
  });
});

describe("PIN lock", () => {
  test("default PIN is 1627 until changed; only a hash is stored", async () => {
    expect(await isDefaultPin()).toBe(true);
    expect((await verifyPin("1627")).ok).toBe(true);
    await changePin("1627", "2580");
    expect((await verifyPin("1627")).ok).toBe(false);
    expect((await verifyPin("2580")).ok).toBe(true);
    expect(JSON.stringify(await db().preferences.toArray())).not.toContain("2580");
  });

  test("after 5 wrong PINs there is a growing wait", async () => {
    for (let i = 0; i < 4; i += 1) expect(await verifyPin("0000")).toEqual({ ok: false, waitSeconds: 0 });
    expect((await verifyPin("0000")).waitSeconds).toBe(30);
    expect((await verifyPin("1627")).ok).toBe(false); // even the right PIN must wait
    vi.setSystemTime(new Date("2026-11-11T06:00:31Z"));
    expect(await pinWaitSeconds()).toBe(0);
    expect((await verifyPin("1627")).ok).toBe(true);
    vi.setSystemTime(new Date("2026-11-11T06:00:00Z"));
  });
});
